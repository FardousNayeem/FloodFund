// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract FloodFund {

    struct Donor {
        uint accountNumber;
        string mobileNumber;
        string name;
    }
    
    mapping(address => Donor) public donors;

    uint public donorCount;

    address payable public sylhetFundraiser;
    address payable public chittagongSouthFundraiser;
    address payable public chittagongNorthFundraiser;

    constructor() {
        sylhetFundraiser = payable(0x644f17865493E1862236e568434690224813bf77);
        chittagongSouthFundraiser = payable(0x0d82576c8d778d135f197AD9BDD21268008f9Ac3);
        chittagongNorthFundraiser = payable(0x0fD7cAC82c431CB40937d391543FF039f3C58774);
    }

    function registerDonor(string memory _name, string memory _mobile) public {
        require(msg.sender != sylhetFundraiser && msg.sender != chittagongSouthFundraiser && msg.sender != chittagongNorthFundraiser, "A fundraiser account cannot be registered as a donor account.");

        donorCount++;
        donors[msg.sender] = Donor(donorCount, _mobile, _name);
    }

    function donate(string memory _mobile, string memory _zone) public payable {

        require(keccak256(abi.encodePacked(_mobile)) == keccak256(abi.encodePacked(donors[msg.sender].mobileNumber)), "User is not registered");

        if (keccak256(abi.encodePacked(_zone)) == keccak256(abi.encodePacked("sylhet"))) {
            sylhetFundraiser.transfer(msg.value);
        } else if (keccak256(abi.encodePacked(_zone)) == keccak256(abi.encodePacked("chittagong-south"))) {
            chittagongSouthFundraiser.transfer(msg.value);
        } else if (keccak256(abi.encodePacked(_zone)) == keccak256(abi.encodePacked("chittagong-north"))) {
            chittagongNorthFundraiser.transfer(msg.value);
        }
    }

    function getDonationsInfo() public view returns (uint total, uint sylhet, uint chittagongSouth, uint chittagongNorth) {
        uint sylhetDonations = sylhetFundraiser.balance;
        uint chittagongSouthDonations = chittagongSouthFundraiser.balance;
        uint chittagongNorthDonations = chittagongNorthFundraiser.balance;
        return (sylhetDonations+chittagongSouthDonations+chittagongNorthDonations, sylhetDonations, chittagongSouthDonations, chittagongNorthDonations);
    }

    function getDonorInfo(address _donorAddress) public view returns (string memory name, string memory mobile) {
        Donor memory donor = donors[_donorAddress];
        return (donor.name, donor.mobileNumber);
    }
}