const fs = require('fs');
const UnityDecryptClient = require('unity-package-decrypt').UnityDecryptClient;


const client = new UnityDecryptClient();
const src = fs.readFileSync('./.downloads/64131.tmp', {encoding:'binary'});
const keySrc = 'e81fcf96affbb4925a23ad15ab1c8cce16de0e9c2fb37662c5070cd39b76755902108a0d45313c49bb57f2f694b22746';
client.decrypt(src, keySrc).then((data) => {
    fs.writeFileSync('./.downloads/64131.unitypackage', data);
});