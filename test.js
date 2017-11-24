const _         = require('underscore'),
      fs        = require('fs'),
      fse       = require('fs-extra'),
      fsPath    = require('fs-path'),
      Client    = require('unity-package-extract').UnityExtractClient;

let client          = new Client(),
    name            = 'VRTK - Virtual Reality Toolkit - VR Toolkit',
    unitypackage    = `${__dirname}/.downloads/${name}.unitypackage`,
    output          = `${__dirname}/.downloads/${name}/`,
    tmp             = `${__dirname}/.downloads/_${name}/`;

fse.emptyDirSync(tmp);
fse.emptyDirSync(output);
client.extract(unitypackage, tmp)
    .then(() => {
        _.each(fs.readdirSync(tmp), item => {
            if(!item.startsWith('.')) {
                let path = fs.readFileSync(`${tmp}${item}/pathname`).toString().split('\n')[0],
                    newPath = `${output}${path}`,
                    oldPath = `${tmp}${item}/asset`;
                if(fs.existsSync(oldPath)) {
                   fse.moveSync(oldPath, newPath, {overwrite:true});
                }
            }
        });
        fse.removeSync(tmp);
    })
    .then(() => console.log('done'))
    .catch(console.error);