const _         = require('underscore'),
      fs        = require('fs'),
      fse       = require('fs-extra'),
      fsPath    = require('fs-path'),
      path      = require('path'),
      Client    = require('unity-package-extract').UnityExtractClient;

let client  = new Client(),
    folder  = `./.downloads`,
    name    = 'VRTK - Virtual Reality Toolkit - VR Toolkit',
    unitypackage    = path.join(__dirname, folder, `${name}.unitypackage`),
    output          = path.join(__dirname, folder, name);

fse.emptyDirSync(output);
client.extract(unitypackage, output)
    .then(() => console.log('done'))
    .catch(console.error);