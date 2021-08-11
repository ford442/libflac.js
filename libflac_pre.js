(function(root,factory){
if(typeof define === 'function' && define.amd){
define(['module','require'],factory.bind(null,root));
}else if(typeof module === 'object' && module.exports){
var env=typeof process !== 'undefined' && process && process.env?process.env:root;
factory(env,module,module.require);
}else{
root.Flac=factory(root);
}
}(typeof self !== 'undefined'?self:typeof window !== 'undefined'?window:this,function(global,expLib,require){
'use strict';
var Module=Module || {};
var _flac_ready=false;
Module["onRuntimeInitialized"]=function(){
_flac_ready=true;
if(!_exported){
setTimeout(function(){do_fire_event('ready',[{type:'ready',target:_exported}],true);},0);
}else{
do_fire_event('ready',[{type:'ready',target:_exported}],true);
}
};
if(global && global.FLAC_SCRIPT_LOCATION){
Module["locateFile"]=function(fileName){
var path=global.FLAC_SCRIPT_LOCATION || '';
if(path[fileName]){
return path[fileName];
}
path+=path && !/\/$/.test(path)?'/':'';
return path+fileName;
};
var readBinary=function(filePath){
if(ENVIRONMENT_IS_NODE){
var ret=read_(filePath,true);
if(!ret.buffer){
ret=new Uint8Array(ret);
}
assert(ret.buffer);
return ret;
}
return new Promise(function(resolve,reject){
var xhr=new XMLHttpRequest();
xhr.responseType="arraybuffer";
xhr.addEventListener("load",function(evt){
resolve(xhr.response);
});
xhr.addEventListener("error",function(err){
reject(err);
});
xhr.open("GET",filePath);
xhr.send();
});};}
if(global && typeof global.fetch === 'function'){
var _fetch=global.fetch;
global.fetch=function(url){
return _fetch.apply(null,arguments).catch(function(err){
try{
var result=readBinary(url);
if(result && result.catch){
result.catch(function(_err){throw err;});
}
return result;
}catch(_err){
throw err;
}});};}
