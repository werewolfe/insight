'use strict';

var TRANSACTION_DISPLAYED = 10;
var BLOCKS_DISPLAYED = 5;

angular.module('insight.system').controller('IndexController',
  function($scope, Global, getSocket, Blocks, getAssetMetadata, getPopularAssets, getMainStats, getAssetTransactions) {
    $scope.global = Global;

    function simpleAssetMeta(asset) {
      var meta = asset.metaData && asset.metaData.metadataOfIssuence && asset.metaData.metadataOfIssuence.data;
      var urls = asset.metaData && asset.metaData.metadataOfIssuence && asset.metaData.metadataOfIssuence.data && asset.metaData.metadataOfIssuence.data.urls || [];
      
      var assetName = "";
      var assetDesc = "";
      var issuer = "";
      
      var smallIcon = "";
      var largeIcon = "";
      
      if (meta) {
        assetName = meta.assetName;
        assetDesc = meta.description;
        issuer = meta.issuer || "N/A";
      }
    
      urls.forEach(function (metaurl) {
        if (metaurl.name == "icon") {
          smallIcon = metaurl.url;
        }
        
        if (metaurl.name == "icon_large") {
          largeIcon = metaurl.url;
        }
      });
      
      var assetImage = largeIcon || smallIcon || "/explorer/img/default_icon.png";
      var verifications = meta && meta.verifications || false;
      var assetMeta = {name: assetName, desc: assetDesc, icon: assetImage, issuer: issuer, verifications: verifications};
      
      return assetMeta;
    }
    

    var getAssetMetaData = function(asset, utxo, callback){
      var time = Math.floor(new Date().getTime() / 1000);
      var assetName = asset.assetId;
      var assetIcon; //= defaultIcon;
      var metaapi = "http://localhost:8080/v2/" + "assetmetadata/" + asset.assetId;
      var localIndex = encodeURIComponent(utxo);
      var local = localStorage[localIndex];
      var called = false;
      var issuer = "N/A";
      var verifications = {};
      
      if (local) {
        var localData = JSON.parse(local);
      } 
      
      // check for asset metadata in local storage
      if (localData) {
        // get asset meta from localstorage
        assetName = localData.name || asset.assetId;
        assetIcon = localData.icon;
        issuer = localData.issuer;
        verifications = localData.verifications
        
        // sending back the data
        //return callback({assetName: assetName, assetIcon: assetIcon, issuer: issuer, verifications: verifications});
      } 
    
      return getAssetMetadata.get( { assetId: asset.assetId, index: localIndex }, function (apimeta) {
        asset.metaData = apimeta;
        
        var assetMeta = simpleAssetMeta(asset);
        assetName = assetMeta.name || asset.assetId;
        assetIcon = assetMeta.icon;
        issuer = assetMeta.issuer;
        verifications = assetMeta.verifications;
        
        // save data to localstorage
        // console.log({name: assetName, icon: assetMeta.icon, issuer: issuer, last: time, verifications: verifications});
        localStorage[localIndex] = JSON.stringify({name: assetName, icon: assetMeta.icon, issuer: issuer, last: time, verifications: verifications});
        // sending back the data
        return callback({assetName: assetName, assetIcon: assetIcon, issuer: issuer, verifications: verifications});
      }, function (err) {
        return callback({assetName: assetName, assetIcon: assetIcon, issuer: issuer, verifications: verifications});
      })
    }

    var getPopularAssetsList = function() {
      var appended = "";
      var holder;
      return getPopularAssets.query(function (resp) {
        var i = 0;
        var getAssetData = function(cb) {
          getAssetMetaData(resp[i], resp[i].someUtxo, function (meta) {
            i++;
            if(i === resp.length) {
              return cb();
            } else {
              return getAssetData(cb);
            }
          });
        }
        getAssetData(function(done) {
        })
      });
    }

    var _getAssetStats = function() {
      return getMainStats.get(function(resp) {
        $scope.numOfAssets = resp.numOfAssets;
        $scope.numOfDATransactions = resp.numOfDATransactions;
        $scope.numOfHolders = resp.numOfHolders;
      });
    }

    var _getLatestAssets = function() {
      return getAssetTransactions.query(function(resp) {
        $scope.latestAssets = resp.map(function(a) {
          var transtype = a.dadata && a.dadata[0] && a.dadata[0].type || "N/A";
          var totalAsset = 0;
          var inputsAdr = [];

          a.vin.forEach(function (input) {
            var address = input.previousOutput && input.previousOutput.addresses && input.previousOutput.addresses[0] || false;
            if (address) {
              inputsAdr.push(address);
            }
          });

          a.vout.forEach(function (output) {
            // make sure this is not change
            var address = output.scriptPubKey && output.scriptPubKey.addresses && output.scriptPubKey.addresses[0] || false;
            if (!address || inputsAdr.indexOf(address) == -1 || transtype == "issuance" ) {
              if (typeof output.assets !== 'undefined') {
                output.assets.forEach(function (asset) {
                  var divisor = Math.pow(10, asset.divisibility);
                  totalAsset = parseFloat(totalAsset);
                  totalAsset+= asset.amount / divisor;
                  totalAsset = totalAsset.toFixed(asset.divisibility); 
                })
              }
            }
          })
          return {
            transtype: transtype,
            txid: a.txid,
            time: a.time,
            block: a.blockheight,
            blockhash: a.blockhash,
            totalAsset: totalAsset
          };
        });
      });
    }

    var _getBlocks = function() {
      Blocks.get({
        limit: BLOCKS_DISPLAYED
      }, function(res) {
        $scope.blocks = res.blocks;
        $scope.blocksLength = res.length;
      });
    };

    var socket = getSocket($scope);

    var _startSocket = function() { 
      socket.emit('subscribe', 'inv');
      socket.on('tx', function(tx) {
        $scope.txs.unshift(tx);
        if (parseInt($scope.txs.length, 10) >= parseInt(TRANSACTION_DISPLAYED, 10)) {
          $scope.txs = $scope.txs.splice(0, TRANSACTION_DISPLAYED);
        }
      });

      socket.on('block', function() {
        _getBlocks();
      });
    };

    socket.on('connect', function() {
      _startSocket();
    });



    $scope.humanSince = function(time) {
      var m = moment.unix(time);
      return m.max().fromNow();
    };

    $scope.index = function() {
      _getBlocks();
      _startSocket();
      _getLatestAssets();
      _getAssetStats();
      getPopularAssetsList();
    };

    $scope.txs = [];
    $scope.blocks = [];
    $scope.latestAssets = [];
  });
