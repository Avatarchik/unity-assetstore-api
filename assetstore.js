const _ = require('underscore'),
	  fs = require('fs'),
	  request = require('request-promise-native'),
	  Nightmare = require('nightmare'),
	  LocalStorage = require('node-localstorage').LocalStorage,
	  localStorage = new LocalStorage('./.ls');

const ASSET_STORE_HOST 	= 'https://www.assetstore.unity3d.com',
	  HOME_PAGE 		= '/',
	  LOGIN_PAGE 		= '/auth/browser/login';


class AssetStore {
	init() {
		this.downloadAsset('VRTK - Virtual Reality Toolkit - [ VR Toolkit ]').then(console.log);
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
				console.log(`[AssetStore] requesting asset list ...`);
				if(!refresh && this._list) resolve(this._list);
				else return request({
					method: 'POST',
					url: 'https://kharma.unity3d.com/api/en-US/account/downloads/search.json?tag=%23PACKAGES',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
						'Cookie': `kharma_session=${this._session}`
					},
					body: '[]',
					json: true
				});
			})
			.then(list => {
				this._list = list.results;
				return this._list;
			});
	}


	getAssetNamed(name) {
		return this.getAssetList().then(list => _.findWhere(list, {name}));
	}


	getAssetDownloadInfo(name) {
		return this.getAssetNamed(name)
			.then(asset => {
				console.log(`[AssetStore] requesting download info for asset [${asset.id}]/${asset.name} ...`);
				return request({
					method: 'GET',
					url: `https://kharma.unity3d.com/api/en-US/content/download/${asset.id}.json`,
					headers: {'Cookie': `kharma_session=${this._session}`},
					json: true
				});
			})
			.then(info => {
				return {
					name: 	info.download.filename_safe_package_name,
					url: 	info.download.url,
					key: 	info.download.key
				}
			});
	}


	downloadAsset(name) {
		return this.getAssetDownloadInfo(name)
			.then(info => request(info.url).pipe(fs.createWriteStream(`${info.name}.unitypackage`)));
	}
}


module.exports = new AssetStore();