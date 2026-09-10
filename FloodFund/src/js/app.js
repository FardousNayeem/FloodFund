App = {
  // the vaiable below will store references of wallet, smart contract and your accounts
  webProvider: null,
  contracts: {},
  account: '0x0',
 
 
  initWeb: function() {
      // if an ethereum provider instance is already provided by metamask
      const provider = window.ethereum
      if( provider ){
        App.webProvider = provider;
      }
      else{
        $("#loader-msg").html('No metamask ethereum provider found')
  
        // specify default instance if no web3 instance provided
        App.webProvider = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
      }
      return App.initContract();
  },
 
 
  initContract: function() {
      $.getJSON("FloodFund.json", function( floodFund ){
        // instantiate a new truffle contract from the artifict
        App.contracts.FloodFund = TruffleContract( floodFund );
   
        // connect provider to interact with contract
        App.contracts.FloodFund.setProvider( App.webProvider );
        
        return App.render();
      })
  },
 
  render: async function(){

      const registerForm = $("#registerForm");
      const infoForm = $('#infoForm');
      const clearButton = $("#clearButton");
      const donationForm = $("#donationForm");
      const donations = $('#donations');
   
      registerForm.hide();
      infoForm.hide();
      clearButton.hide();
      donationForm.hide();
      donations.hide();
     
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          App.account = accounts;
          $("#accountAddress").html(`You have ${ App.account.length } account connected from metamask: ${ App.account } <br/> Current account in use: ${App.account[0]}`);
        } catch (error) {
          if (error.code === 4001) {
            console.warn('user rejected')
          }
          $("#accountAddress").html("Your Account: Not Connected");
          console.error(error);
        }
      }
  },
  registerClick: async function() {
    const registerForm = $("#registerForm");
    const registerButton = $("#registerButton");
   
    registerForm.show();
    registerButton.hide();
  },

  register: async function() {
    const contractInstance = await App.contracts.FloodFund.deployed()

    const donorName = $("#donorName").val();
    const number = $("#number").val();

    const result = await contractInstance.registerDonor(donorName, number, { from: App.account[0] });

    const registerForm = $("#registerForm");
    const registerButton = $("#registerButton");
   
    registerForm.hide();
    registerButton.show();

    alert("You have registered successfully")
  },

  infoClick: async function() {
    const infoForm = $("#infoForm");
    const infoButton = $("#infoButton");
   
    infoForm.show();
    infoButton.hide();
  },

  checkInfo: async function() {
    const contractInstance = await App.contracts.FloodFund.deployed()

    const address = $("#address").val();

    const result = await contractInstance.getDonorInfo(address);

    const infoForm = $("#infoForm");
    const clearButton = $("#clearButton");
   
    infoForm.hide();
    clearButton.show();

    $("#donorInfoName").html(`Name: ${result[0]}`);
    $("#donorInfoNumber").html(`Number: ${result[1]}`);
  },
  clearInfo: function() {
    const clearButton = $('#clearButton');
    const infoButton = $("#infoButton");

    $("#donorInfoName").html('');
    $("#donorInfoNumber").html('');

    clearButton.hide();
    infoButton.show();
  },
  donateClick: function() {
    const donationForm = $('#donationForm');
    const donateButton = $("#donateButton");

    donateButton.hide();
    donationForm.show();
  },
  donate: async function() {
    const contractInstance = await App.contracts.FloodFund.deployed()

    const region = $("#region").val();
    const number = $("#donateNumber").val();
    const balance = $("#balance").val();

    const result = await contractInstance.donate(number, region, { from: App.account[0], value: balance });

    const donationForm = $('#donationForm');
    const donateButton = $("#donateButton");

    donateButton.show();
    donationForm.hide();

    alert("Donation successfully")
  },
  checkDonations: async function() {

    const contractInstance = await App.contracts.FloodFund.deployed()

    
    const results = $("#results");
    results.empty();

    const balances = await contractInstance.getDonationsInfo()
    const total = balances[0];
    const sylhet = balances[1];
    const south = balances[2];
    const north = balances[3];

    const sylhetTemplate = "<tr><td>Sylhet</td><td>" + sylhet + "</td></tr>"
    const southTemplate = "<tr><td>Chittagong-South</td><td>" + south + "</td></tr>"
    const northTemplate = "<tr><td>Chittagong-North</td><td>" + north + "</td></tr>"
    const totalTemplate = "<tr><td>Total</td><td>" + total + "</td></tr>"

    results.append( sylhetTemplate );
    results.append( southTemplate );
    results.append( northTemplate );
    results.append( totalTemplate );

    const donations = $('#donations');
    const checkDonationButton = $("#checkDonationButton");

    donations.show();
    checkDonationButton.hide();

  }
 };
 
 
 $(function() {
  $(window).load(function() {
    App.initWeb();
  });
 });
 
