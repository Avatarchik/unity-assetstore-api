const assetstore = require('./assetstore.js');


assetstore.init().then(() => console.log(assetstore._session));