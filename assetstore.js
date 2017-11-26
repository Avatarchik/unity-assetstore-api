const _ 					= require('underscore'),
	  fs 					= require('fs'),
	  fse 					= require('fs-extra'),
	  request 				= require('request-promise-native'),
	  progress 				= require('request-progress'),
	  Nightmare 			= require('nightmare'),
	  UnityDecryptClient 	= require('unity-package-decrypt').UnityDecryptClient,
	  LocalStorage 			= require('node-localstorage').LocalStorage,
	  localStorage 			= new LocalStorage('./.ls');

const ASSET_STORE_HOST 	= 'https://www.assetstore.unity3d.com',
	  HOME_PAGE 		= '/',
	  LOGIN_PAGE 		= '/auth/browser/login';


class AssetStore {
	init() {
		this.downloadAsset('64131');
	}


	//get session id
	getSessionID(refresh = false) {
		return new Promise((resolve, reject) => {
			let storedSessionID = localStorage.getItem('session');

			//get session id from stored file
			if(!refresh && storedSessionID) {
				this._session = storedSessionID;
				console.log('[AssetStore] got session id from cache');
				resolve(storedSessionID);
			}
			//otherwise let user login to assetstore and get the session id from cookie
			else {
				//read assetstore username and password (if any)
				let secretPath = './.secret',
					exists = fs.existsSync(secretPath),
					secrets = exists ? JSON.parse(fs.readFileSync(secretPath)) : {};
				
				//open a browser window to login to assetstore
				console.log('[AssetStore] please login to get a new session id');
				Nightmare({show:true, waitTimeout:1000*60*60})
					.viewport(960, 640)
					.goto(`${ASSET_STORE_HOST}${LOGIN_PAGE}?go=${encodeURIComponent(ASSET_STORE_HOST + HOME_PAGE)}`)
					.type('#conversations_create_session_form_email', secrets.email || '')
					.type('#conversations_create_session_form_password', secrets.password || '')
					.click('input[type="submit"]')
					.wait('#unav-pkg')
					.end()
					.cookies.get()
					.then(cookies => {
						//save the session id
						let session = _.findWhere(cookies, {name:'kharma_session'}).value;
						if(session) {
							localStorage.setItem('session', session);
							this._session = session;
							console.log('[AssetStore] new session id stored');
							resolve(session);
						}
						else {
							console.error('can\'t find session id in cookie', cookies);
							reject(new Error('can\'t find session id in cookie'));
						}
					})
					.catch(reject);
			}
		});
	}


	getAssetList(refresh = false) {
		return this.getSessionID()
			.then(() => {
				let storedList = localStorage.getItem('assetlist');
				if(storedList) {
					console.log('[AssetStore] got asset list from cache');
					return JSON.parse(storedList);
				}
				else {
					console.log(`[AssetStore] requesting asset list ...`);
					return request({
						method: 'POST',
						url: 'https://kharma.unity3d.com/api/en-US/account/downloads/search.json?tag=%23PACKAGES',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
							'Cookie': `kharma_session=${this._session}`
						},
						body: '[]',
						json: true
					})
					.then(resp => {
						let fetchedList = resp.results;
						localStorage.setItem('assetlist', JSON.stringify(fetchedList, null, 4));
						return fetchedList;
					});
				}
			});
	}


	getAssetNamed(id) {
		return this.getAssetList().then(list => _.findWhere(list, {id}));
	}


	getAssetDownloadInfo(id) {
		return this.getAssetNamed(id)
			.then(asset => {
				let storedInfo = localStorage.getItem(`info-${id}`);
				if(storedInfo) {
					console.log('[AssetStore] got info from cache');
					return JSON.parse(storedInfo);
				}
				else {
					console.log(`[AssetStore] requesting download info for asset [${asset.id}]/${asset.name} ...`);
					return request({
						method: 'GET',
						url: `https://kharma.unity3d.com/api/en-US/content/download/${asset.id}.json`,
						headers: {'Cookie': `kharma_session=${this._session}`},
						json: true
					})
					.then(fetchedInfo => {
						let info = fetchedInfo.download;
						localStorage.setItem(`info-${id}`, JSON.stringify(info, null, 4));
						return info;
					});
				}
			});
	}


	downloadAsset(id) {
		return this.getAssetDownloadInfo(id)
			.then(info => {
				let folder = './.downloads',
					encryptedFilePath = `${folder}/${info.id}.tmp`,
					decryptedFilePath = `${folder}/${info.filename_safe_package_name}.unitypackage`;
				_.extend(info, {path:{encryptedFilePath, decryptedFilePath}});

				return new Promise((resolve, reject) => {
					if(fs.existsSync(encryptedFilePath)) {
						console.log(`[AssetStore] got file from cache`);
						resolve(info);
					}
					else {
						console.log(`[AssetStore] downloading from ${info.url} ...`);
						fse.ensureDirSync(folder);
						progress(request(info.url))
							.on('progress', state => console.log(state.percent.toFixed(2) * 100 + '%'))
							.on('error', reject)
							.on('end', () => resolve(info))
							.pipe(fs.createWriteStream(info.path.encryptedFilePath));
					}
				});
			})
			.then(info => {
				console.log(`[AssetStore] decrypting asset package ...`);
				
				//TODO Failed to import package with error: Couldn't decompress package
				return new UnityDecryptClient()
					.decrypt(fs.readFileSync(info.path.encryptedFilePath, {encoding:'binary'}), info.key)
					.then(decryptedData => fs.writeFileSync(info.path.decryptedFilePath, decryptedData))
					// .then(() => fs.unlinkSync(info.path.encryptedFilePath))
					.then(() => console.log('ALL DONE'));
			});
	}
}


module.exports = new AssetStore();