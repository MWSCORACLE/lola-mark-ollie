/* Bridge between the web app and Capacitor native plugins.
   Present only inside the iOS app; in a browser window.NativeBridge stays undefined
   and the app falls back to browser storage and the browser mic. */
(function(){
  var C=window.Capacitor;
  if(!C||!C.isNativePlatform||!C.isNativePlatform())return;
  var Preferences=C.registerPlugin('Preferences');
  var Speech=C.registerPlugin('SpeechRecognition');
  var StatusBar=C.registerPlugin('StatusBar');
  var SplashScreen=C.registerPlugin('SplashScreen');
  var Haptics=C.registerPlugin('Haptics');
  window.NativeBridge={
    platform:C.getPlatform(),
    storage:{
      get:function(k){return Preferences.get({key:k}).then(function(r){return r&&r.value!=null?r.value:null})},
      set:function(k,v){return Preferences.set({key:k,value:v})},
      remove:function(k){return Preferences.remove({key:k})}
    },
    speech:{
      available:function(){return Speech.available().then(function(r){return !!(r&&r.available)}).catch(function(){return false})},
      requestPermission:function(){
        return Speech.checkPermissions().then(function(p){
          if(p.speechRecognition==='granted')return true;
          return Speech.requestPermissions().then(function(q){return q.speechRecognition==='granted'});
        });
      },
      /* resolves with final transcript alternatives when the user taps stop or iOS detects the end of speech */
      listen:function(lang,max){return Speech.start({language:lang||'es-US',maxResults:max||4,partialResults:false,popup:false}).then(function(r){return (r&&r.matches)||[]})},
      stop:function(){return Speech.stop()}
    },
    haptic:function(kind){try{Haptics.notification({type:kind||'SUCCESS'})}catch(e){}}
  };
  try{StatusBar.setStyle({style:'DEFAULT'})}catch(e){}
  try{SplashScreen.hide()}catch(e){}
})();
