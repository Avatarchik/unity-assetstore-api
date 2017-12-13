const _ 					= require('underscore'),
	  Args 					= require('args-js'),
	  fs 					= require('fs'),
	  fse 					= require('fs-extra'),
	  clui 					= require('clui'),
	  colors 				= require('colors'),
	  request 				= require('request-promise-native'),
	  progress 				= require('request-progress'),
	  Nightmare 			= require('nightmare'),
	  UnityDecryptClient 	= require('unity-package-decrypt').UnityDecryptClient,
	  UnityExtractClient 	= require('unity-package-extract').UnityExtractClient,
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
	getSessionID() {
		let args = Args([
			{refresh:Args.BOOL | Args.Optional, _default:false}
		], arguments);
		return new Promise((resolve, reject) => {
			let storedSessionID = localStorage.getItem('session');

			//get session id from stored file
			if(!args.refresh && storedSessionID) {
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


	getAssetList() {
		let args = Args([
			{refresh:Args.BOOL | Args.Optional, _default:false}
		], arguments);
		return this.getSessionID()
			.then(() => {
				let storedList = localStorage.getItem('assetlist');
				if(!args.refresh && storedList) {
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


	searchAsset() {
		let args = Args([
			{query:Args.STRING | Args.Required},
			{refresh:Args.BOOL | Args.Optional, _default:false}
		], arguments);

		let spinner = new clui.Spinner('[AssetStore] searching ... ', ['|', '/', '-', '\\']);
		spinner.start();

		return this.getAssetList(args.refresh)
			.then(list => { spinner.stop(); return list; })
			.then(list => _.filter(list, item => item.name.toLowerCase().match(args.query.toLowerCase())))
			.then(list => _.each(list, item => console.log(`[${item.id}]`.yellow, item.name, `/ ${item.publisher.name}`.gray)));
	}


	getAssetById() {
		let args = Args([
			{id: 		Args.STRING | Args.Required},
			{refresh: 	Args.BOOL 	| Args.Optional, _default:false}
		], arguments);
		return this.getAssetList(args.refresh).then(list => _.findWhere(list, {id:args.id}));
	}


	getAssetDownloadInfo() {
		let args = Args([
			{id: 		Args.STRING | Args.Required},
			{refresh: 	Args.BOOL 	| Args.Optional, _default:false}
		], arguments);
		return this.getSessionID()
			.then(() => {
				let key = `info-${args.id}`,
					storedInfo = localStorage.getItem(key);
				if(!args.refresh && storedInfo) {
					console.log('[AssetStore] got info from cache');
					return JSON.parse(storedInfo);
				}
				else {
					console.log(`[AssetStore] requesting download info for asset ${args.id} ...`);
					return request({
						method: 'GET',
						url: `https://kharma.unity3d.com/api/en-US/content/download/${args.id}.json`,
						headers: {'Cookie': `kharma_session=${this._session}`},
						json: true
					})
					.then(fetchedInfo => {
						let info = fetchedInfo.download;
						localStorage.setItem(key, JSON.stringify(info, null, 4));
						return info;
					});
				}
			});
	}


	downloadAssetPackage() {
		let args = Args([
			{id: 		Args.STRING | Args.Required},
			{refresh: 	Args.BOOL 	| Args.Optional, _default:false}
		], arguments);
		return this.getAssetDownloadInfo(args)
			.then(info => {
				let folder = './.downloads',
					encryptedFilePath = `${folder}/${info.id}.tmp`,
					decryptedFilePath = `${folder}/${info.id}.unitypackage`;
				_.extend(info, {path:{encryptedFilePath, decryptedFilePath}});

				if(!args.refresh && fs.existsSync(decryptedFilePath)) {
					console.log(`[AssetStore] got decrypted package from cache`);
					return info;
				}
				else {
					return new Promise((resolve, reject) => {
						console.log(`[AssetStore] downloading file from ${info.url} ...`);
						fse.ensureDirSync(folder);
						progress(request(info.url))
							.on('progress', state => {
								process.stdout.clearLine();
								process.stdout.cursorTo(0);
								process.stdout.write(clui.Gauge(state.percent, 1, 20, 1, `${(state.percent * 100).toFixed(2)}%`));
							})
							.on('error', reject)
							.on('end', () => resolve(info))
							.pipe(fs.createWriteStream(info.path.encryptedFilePath));
					})
					.then(info => {
						console.log(`\n[AssetStore] decrypting asset package ...`);
						return new UnityDecryptClient()
							.decrypt(fs.readFileSync(info.path.encryptedFilePath, {encoding:'binary'}), info.key)
							.then(decryptedData => fs.writeFileSync(info.path.decryptedFilePath, decryptedData, {encoding:'binary'}))
							.then(() => fs.unlinkSync(info.path.encryptedFilePath))
							.then(() => info);
					});
				}
			});
	}


	extractAsset() {
		let args = Args([
			{id: 				Args.STRING | Args.Required},
			{unityProjectPath: 	Args.STRING | Args.Optional, _default:'.'},
			{refresh: 			Args.BOOL 	| Args.Optional, _default:false}
		], arguments);
		return this.downloadAssetPackage(args)
			.then(info => {
				console.log(`[AssetStore] extracting package to ${args.unityProjectPath} ...`);
				let tmp = `./.assets/`;
				return new Promise((resolve, reject) => {
					let client = new UnityExtractClient();
					client.extract(info.path.decryptedFilePath, tmp)
						  .then(() => client.convert(tmp, args.unityProjectPath)
						  .then(() => fse.removeSync(tmp))
						  .then(resolve));
				});
			});
	}
}


module.exports = new AssetStore();