const _ = require('underscore'),
	  fs = require('fs'),
	  Nightmare = require('nightmare'),
	  LocalStorage = require('node-localstorage').LocalStorage,
	  localStorage = new LocalStorage('./.ls');

const ASSET_STORE_HOST 	= 'https://www.assetstore.unity3d.com',
	  HOME_PAGE 		= '/',
	  LOGIN_PAGE 		= '/auth/browser/login';


class AssetStore {
	init() {
		return this.getSessionID();
	}


	//get session id
	getSessionID(forceNew = false) {
		return new Promise((resolve, reject) => {
			let storedSessionID = localStorage.getItem('session');

			//get session id from stored file
			if(!forceNew && storedSessionID) {
				this._session = storedSessionID;
				resolve(storedSessionID);
			}
			//otherwise let user login to assetstore and get the session id from cookie
			else {
				//read assetstore username and password (if any)
				let secretPath = './.secret',
					exists = fs.existsSync(secretPath),
					secrets = exists ? JSON.parse(fs.readFileSync(secretPath)) : {};
				
				//open a browser window to login to assetstore
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
}


module.exports = new AssetStore();