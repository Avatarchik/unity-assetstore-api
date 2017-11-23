const _ = require('underscore'),
	  Nightmare = require('nightmare');

const ASSET_STORE_HOST 	= 'https://www.assetstore.unity3d.com',
	  HOME_PAGE 		= '/',
	  LOGIN_PAGE 		= '/auth/browser/login'

Nightmare({
		show: true,
		waitTimeout: 1000*60*60,
		webPreferences: {
			images: false
		}
	})
	.viewport(960, 640)
	.goto(`${ASSET_STORE_HOST}${LOGIN_PAGE}?go=${encodeURIComponent(ASSET_STORE_HOST + HOME_PAGE)}`)
	.wait('#unav-pkg')
	.end()
	.cookies.get()
	.then(cookies => {
		let session = _.findWhere(cookies, {name:'kharma_session'}).value;
		console.log(session);
	});