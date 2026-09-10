// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.16 <0.9.0;

/// @title FloodFund
/// @notice Routes donations to one of three flood-relief fundraiser wallets in
///         Bangladesh and keeps an on-chain record of what was actually raised
///         through this contract.
/// @dev    The contract is a pass-through: it never holds a balance. Every
///         donation is forwarded inside the same transaction, and any path that
///         could leave ether behind reverts instead.
contract FloodFund {
    /// @notice The relief zones donations can be routed to.
    /// @dev    Zones are an enum rather than a string. A value outside the enum
    ///         range fails ABI decoding before `donate` runs, so an unrecognised
    ///         zone can never be paid for and then silently dropped.
    enum Zone {
        Sylhet,
        ChittagongSouth,
        ChittagongNorth
    }

    struct Donor {
        bool registered;
        uint32 id;
        uint32 donationCount;
        uint128 totalDonated;
        string name;
        // keccak256(donor address, mobile number). The plaintext number is
        // never stored: `donors` is world-readable, and publishing a real
        // phone number on a public ledger is permanent. This is a commitment,
        // not encryption. An adversary who already suspects a specific number
        // can confirm it by hashing their guess; it only stops bulk harvesting.
        bytes32 contactCommitment;
    }

    address public owner;

    mapping(Zone => address payable) public fundraisers;
    mapping(Zone => uint256) public raisedByZone;

    uint256 public totalRaised;
    uint256 public donationCount;

    mapping(address => Donor) public donors;
    address[] private _donorList;

    uint256 private _entered;

    event DonorRegistered(address indexed donor, uint32 indexed id, string name);
    event DonorUpdated(address indexed donor, string name);
    event DonationReceived(
        address indexed donor,
        Zone indexed zone,
        uint256 amount,
        uint256 zoneTotal
    );
    event FundraiserChanged(Zone indexed zone, address indexed previous, address indexed current);
    event OwnershipTransferred(address indexed previous, address indexed current);

    error NotOwner();
    error NotRegistered();
    error AlreadyAFundraiser();
    error ZeroAddress();
    error ZeroAmount();
    error EmptyName();
    error TransferFailed();
    error Reentrant();
    error DirectPaymentRejected();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrant();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(
        address payable sylhet,
        address payable chittagongSouth,
        address payable chittagongNorth
    ) {
        if (sylhet == address(0) || chittagongSouth == address(0) || chittagongNorth == address(0)) {
            revert ZeroAddress();
        }

        owner = msg.sender;
        fundraisers[Zone.Sylhet] = sylhet;
        fundraisers[Zone.ChittagongSouth] = chittagongSouth;
        fundraisers[Zone.ChittagongNorth] = chittagongNorth;

        emit OwnershipTransferred(address(0), msg.sender);
        emit FundraiserChanged(Zone.Sylhet, address(0), sylhet);
        emit FundraiserChanged(Zone.ChittagongSouth, address(0), chittagongSouth);
        emit FundraiserChanged(Zone.ChittagongNorth, address(0), chittagongNorth);
    }

    // --- donor registration ------------------------------------------------

    /// @notice Register the caller as a donor, or update an existing profile.
    /// @param name   Display name shown on the donor wall.
    /// @param mobile Contact number. Hashed with the caller's address and never
    ///               stored in plaintext; see `verifyContact`.
    function registerDonor(string calldata name, string calldata mobile) external {
        if (bytes(name).length == 0) revert EmptyName();
        if (_isFundraiser(msg.sender)) revert AlreadyAFundraiser();

        Donor storage donor = donors[msg.sender];
        bytes32 commitment = keccak256(abi.encodePacked(msg.sender, mobile));

        if (donor.registered) {
            // Re-registering updates the profile. It does not mint a second
            // donor id, and it does not inflate the donor count.
            donor.name = name;
            donor.contactCommitment = commitment;
            emit DonorUpdated(msg.sender, name);
            return;
        }

        _donorList.push(msg.sender);
        uint32 id = uint32(_donorList.length);

        donor.registered = true;
        donor.id = id;
        donor.name = name;
        donor.contactCommitment = commitment;

        emit DonorRegistered(msg.sender, id, name);
    }

    /// @notice Check a mobile number against a donor's stored commitment.
    function verifyContact(address donorAddress, string calldata mobile) external view returns (bool) {
        Donor storage donor = donors[donorAddress];
        if (!donor.registered) return false;
        return donor.contactCommitment == keccak256(abi.encodePacked(donorAddress, mobile));
    }

    // --- donating ----------------------------------------------------------

    /// @notice Donate to a relief zone. The full value is forwarded to that
    ///         zone's fundraiser in this transaction.
    /// @dev    Registration is checked against the `registered` flag. The old
    ///         version compared a caller-supplied string to the caller's stored
    ///         number, which an unregistered address satisfied by passing "".
    function donate(Zone zone) external payable nonReentrant {
        if (!donors[msg.sender].registered) revert NotRegistered();
        if (msg.value == 0) revert ZeroAmount();

        address payable fundraiser = fundraisers[zone];
        if (fundraiser == address(0)) revert ZeroAddress();

        Donor storage donor = donors[msg.sender];
        donor.totalDonated += uint128(msg.value);
        unchecked {
            donor.donationCount += 1;
            donationCount += 1;
        }

        uint256 zoneTotal = raisedByZone[zone] + msg.value;
        raisedByZone[zone] = zoneTotal;
        totalRaised += msg.value;

        (bool sent, ) = fundraiser.call{value: msg.value}("");
        if (!sent) revert TransferFailed();

        emit DonationReceived(msg.sender, zone, msg.value, zoneTotal);
    }

    // --- administration ----------------------------------------------------

    /// @notice Point a zone at a different fundraiser wallet.
    /// @dev    The original contract hardcoded three addresses in the
    ///         constructor with no way to rotate a compromised or lost key.
    function setFundraiser(Zone zone, address payable fundraiser) external onlyOwner {
        if (fundraiser == address(0)) revert ZeroAddress();

        address previous = fundraisers[zone];
        fundraisers[zone] = fundraiser;

        emit FundraiserChanged(zone, previous, fundraiser);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address previous = owner;
        owner = newOwner;

        emit OwnershipTransferred(previous, newOwner);
    }

    // --- views -------------------------------------------------------------

    /// @notice Totals actually raised through this contract, in wei.
    /// @dev    The old version returned the fundraisers' wallet balances, which
    ///         counted unrelated funds and fell as relief money was spent.
    function getDonationsInfo()
        external
        view
        returns (uint256 total, uint256 sylhet, uint256 chittagongSouth, uint256 chittagongNorth)
    {
        return (
            totalRaised,
            raisedByZone[Zone.Sylhet],
            raisedByZone[Zone.ChittagongSouth],
            raisedByZone[Zone.ChittagongNorth]
        );
    }

    /// @notice Current wallet balances of the three fundraisers.
    /// @dev    Named for what it is. Useful as a "has the money moved on yet"
    ///         signal, useless as an accounting record.
    function getFundraiserBalances()
        external
        view
        returns (uint256 sylhet, uint256 chittagongSouth, uint256 chittagongNorth)
    {
        return (
            fundraisers[Zone.Sylhet].balance,
            fundraisers[Zone.ChittagongSouth].balance,
            fundraisers[Zone.ChittagongNorth].balance
        );
    }

    function getFundraisers() external view returns (address sylhet, address chittagongSouth, address chittagongNorth) {
        return (
            fundraisers[Zone.Sylhet],
            fundraisers[Zone.ChittagongSouth],
            fundraisers[Zone.ChittagongNorth]
        );
    }

    function getDonorInfo(address donorAddress)
        external
        view
        returns (string memory name, bool registered, uint256 totalDonated, uint256 donations, uint32 id)
    {
        Donor storage donor = donors[donorAddress];
        return (donor.name, donor.registered, donor.totalDonated, donor.donationCount, donor.id);
    }

    function donorCount() external view returns (uint256) {
        return _donorList.length;
    }

    function donorAt(uint256 index) external view returns (address) {
        return _donorList[index];
    }

    function _isFundraiser(address account) private view returns (bool) {
        return
            account == fundraisers[Zone.Sylhet] ||
            account == fundraisers[Zone.ChittagongSouth] ||
            account == fundraisers[Zone.ChittagongNorth];
    }

    /// @dev The contract has no withdrawal path by design, so it must never be
    ///      able to accumulate a balance. Bare transfers are refused.
    receive() external payable {
        revert DirectPaymentRejected();
    }

    fallback() external payable {
        revert DirectPaymentRejected();
    }
}
