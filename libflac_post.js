
function _readStreamInfo(p_streaminfo){
var min_blocksize=Module.getValue(p_streaminfo,'i32');//4 bytes
var max_blocksize=Module.getValue(p_streaminfo+4,'i32');//4 bytes
var min_framesize=Module.getValue(p_streaminfo+8,'i32');//4 bytes
var max_framesize=Module.getValue(p_streaminfo+12,'i32');//4 bytes
var sample_rate=Module.getValue(p_streaminfo+16,'i32');//4 bytes
var channels=Module.getValue(p_streaminfo+20,'i32');//4 bytes
var bits_per_sample=Module.getValue(p_streaminfo+24,'i32');//4 bytes
//FIXME should be at p_streaminfo+28, but seems to be at p_streaminfo+32
var total_samples=Module.getValue(p_streaminfo+32,'i64');//8 bytes
var md5sum=_readMd5(p_streaminfo+40);//16 bytes
return {
min_blocksize:min_blocksize,max_blocksize:max_blocksize,min_framesize:min_framesize,max_framesize:max_framesize,sampleRate:sample_rate,channels:channels,bitsPerSample:bits_per_sample,total_samples:total_samples,md5sum:md5sum
};
}
function _readMd5(p_md5){
var sb=[],v,str;
for(var i=0,len=16; i<len; ++i){
v=Module.getValue(p_md5+i,'i8');//1 byte
if(v<0) v=256+v;//<- "convert" to uint8, if necessary
str=v.toString(16);
if(str.length<2) str='0'+str;
sb.push(str);
}
return sb.join('');
}
function _readFrameHdr(p_frame,enc_opt){
var blocksize=Module.getValue(p_frame,'i32');//4 bytes
var sample_rate=Module.getValue(p_frame+4,'i32');//4 bytes
var channels=Module.getValue(p_frame+8,'i32');//4 bytes
var channel_assignment=Module.getValue(p_frame+12,'i32');//4 bytes
var bits_per_sample=Module.getValue(p_frame+16,'i32');
var number_type=Module.getValue(p_frame+20,'i32');
var frame_number=Module.getValue(p_frame+24,'i32');
var sample_number=Module.getValue(p_frame+24,'i64');
var number=number_type === 0?frame_number:sample_number;
var numberType=number_type === 0?'frames':'samples';
var crc=Module.getValue(p_frame+36,'i8');
var subframes;
if(enc_opt && enc_opt.analyseSubframes){
var subOffset={offset:40};
subframes=[];
for(var i=0; i<channels; ++i){
subframes.push(_readSubFrameHdr(p_frame,subOffset,blocksize,enc_opt));
}
}
return {
blocksize:blocksize,sampleRate:sample_rate,channels:channels,channelAssignment:channel_assignment,bitsPerSample:bits_per_sample,number:number,numberType:numberType,crc:crc,subframes:subframes
};
}
function _readSubFrameHdr(p_subframe,subOffset,block_size,enc_opt){
var type=Module.getValue(p_subframe+subOffset.offset,'i32');
subOffset.offset+=4;
var data;
switch(type){
case 0:
data={value:Module.getValue(p_subframe+subOffset.offset,'i32')};
subOffset.offset+=284;//4;
break;
case 1:
data=Module.getValue(p_subframe+subOffset.offset,'i32');
subOffset.offset+=284;//4;
break;
case 2:	
data=_readSubFrameHdrFixedData(p_subframe,subOffset,block_size,false,enc_opt);
break;
case 3:
data=_readSubFrameHdrFixedData(p_subframe,subOffset,block_size,true,enc_opt);
break;
}
var offset=subOffset.offset;
var wasted_bits=Module.getValue(p_subframe+offset,'i32');
subOffset.offset+=4;
return {
type:type,
data:data,wastedBits:wasted_bits
};
}
function _readSubFrameHdrFixedData(p_subframe_data,subOffset,block_size,is_lpc,enc_opt){
var offset=subOffset.offset;
var data={order:-1,contents:{parameters:[],rawBits:[]}};
var entropyType=Module.getValue(p_subframe_data,'i32');
offset+=4;
var entropyOrder=Module.getValue(p_subframe_data+offset,'i32');
data.order=entropyOrder;
offset+=4;
var partitions=1 << entropyOrder,params=data.contents.parameters,raws=data.contents.rawBits;
var ppart=Module.getValue(p_subframe_data+offset,'i32');
var pparams=Module.getValue(ppart,'i32');
var praw=Module.getValue(ppart+4,'i32');
data.contents.capacityByOrder=Module.getValue(ppart+8,'i32');
for(var i=0; i<partitions; ++i){
params.push(Module.getValue(pparams+(i*4),'i32'));
raws.push(Module.getValue(praw+(i*4),'i32'));
}
offset+=4;
var order=Module.getValue(p_subframe_data+offset,'i32');
offset+=4;
var warmup=[],res;
if(is_lpc){
var qlp_coeff_precision=Module.getValue(p_subframe_data+offset,'i32');
offset+=4;
var quantization_level=Module.getValue(p_subframe_data+offset,'i32');
offset+=4;
var qlp_coeff=[];
for(var i=0; i<order; ++i){
qlp_coeff.push(Module.getValue(p_subframe_data+offset,'i32'));
offset+=4;
}
data.qlp_coeff=qlp_coeff;
data.qlp_coeff_precision=qlp_coeff_precision;
data.quantization_level=quantization_level;
offset=subOffset.offset+152;
offset=_readSubFrameHdrWarmup(p_subframe_data,offset,warmup,order);
if(enc_opt && enc_opt.analyseResiduals){
offset=subOffset.offset+280;
res=_readSubFrameHdrResidual(p_subframe_data+offset,block_size,order);
}}else{
offset=_readSubFrameHdrWarmup(p_subframe_data,offset,warmup,order);
offset=subOffset.offset+32;
if(enc_opt && enc_opt.analyseResiduals){
res=_readSubFrameHdrResidual(p_subframe_data+offset,block_size,order);
}}
subOffset.offset+=284;
return {
partition:{
type:entropyType,data:data
},order:order,warmup:warmup,residual:res
};}
function _readSubFrameHdrWarmup(p_subframe_data,offset,warmup,order){
for(var i=0; i<order; ++i){
warmup.push(Module.getValue(p_subframe_data+offset,'i32'));
offset+=4;
}
return offset;
}
function _readSubFrameHdrResidual(p_subframe_data_res,block_size,order){
var pres=Module.getValue(p_subframe_data_res,'i32');
var res=[];//Module.getValue(pres, 'i32');
for(var i=0,size=block_size-order; i<size; ++i){
res.push(Module.getValue(pres+(i*4),'i32'));
}
return res;
}
function _readConstChar(ptr,length,sb){
sb.splice(0);
var ch;
for(var i=0; i<length; ++i){
ch=Module.getValue(ptr+i,'i8');
if(ch === 0){
break;
}
sb.push(String.fromCodePoint(ch));
}
return sb.join('');
}
function _readNullTerminatedChar(ptr,sb){
sb.splice(0);
var ch=1,i=0;
while(ch>0){
ch=Module.getValue(ptr+i++,'i8');
if(ch === 0){
break;
}
sb.push(String.fromCodePoint(ch));
}
return sb.join('');
}
function _readPaddingMetadata(p_padding_metadata){//-> FLAC__StreamMetadata.type (FLAC__MetadataType) === FLAC__METADATA_TYPE_PADDING (1)
return {
dummy:Module.getValue(p_padding_metadata,'i32')
};}
function _readApplicationMetadata(p_application_metadata){//-> FLAC__StreamMetadata.type (FLAC__MetadataType) === FLAC__METADATA_TYPE_APPLICATION (2)
return {
id:Module.getValue(p_application_metadata,'i32'),data:Module.getValue(p_application_metadata+4,'i32')//TODO should read (binary) data?
};}
function _readSeekTableMetadata(p_seek_table_metadata){//-> FLAC__StreamMetadata.type (FLAC__MetadataType) === FLAC__METADATA_TYPE_SEEKTABLE (3)
var num_points=Module.getValue(p_seek_table_metadata,'i32');
var ptrPoints=Module.getValue(p_seek_table_metadata+4,'i32');
var points=[];
for(var i=0; i<num_points; ++i){
points.push({
sample_number:Module.getValue(ptrPoints+(i*24),'i64'),stream_offset:Module.getValue(ptrPoints+(i*24)+8,'i64'),frame_samples:Module.getValue(ptrPoints+(i*24)+16,'i32')
});}
return {
num_points:num_points,points:points
};}
function _readVorbisComment(p_vorbiscomment){//-> FLAC__StreamMetadata.type (FLAC__MetadataType) === FLAC__METADATA_TYPE_VORBIS_COMMENT (4)
var length=Module.getValue(p_vorbiscomment,'i32');
var entry=Module.getValue(p_vorbiscomment+4,'i32');
var sb=[];
var strEntry=_readConstChar(entry,length,sb);
var num_comments=Module.getValue(p_vorbiscomment+8,'i32');
var comments=[],clen,centry;
var pc=Module.getValue(p_vorbiscomment+12,'i32');
for(var i=0; i<num_comments; ++i){
clen=Module.getValue(pc+(i*8),'i32');
if(clen === 0){
continue;
}
centry=Module.getValue(pc+(i*8)+4,'i32');
comments.push(_readConstChar(centry,clen,sb));
}
return {
vendor_string:strEntry,num_comments:num_comments,comments:comments
};}
function _readCueSheetMetadata(p_cue_sheet){//-> FLAC__StreamMetadata.type (FLAC__MetadataType) === FLAC__METADATA_TYPE_CUESHEET (5)
var sb=[];
var media_catalog_number=_readConstChar(p_cue_sheet,129,sb);
var lead_in=Module.getValue(p_cue_sheet+136,'i64');
var is_cd=Module.getValue(p_cue_sheet+144,'i8');
var num_tracks=Module.getValue(p_cue_sheet+148,'i32');
var ptrTrack=Module.getValue(p_cue_sheet+152,'i32');
var tracks=[],trackOffset=ptrTrack;
if(ptrTrack !== 0){
for(var i=0; i<num_tracks; ++i){
var tr=_readCueSheetMetadata_track(trackOffset,sb);
tracks.push(tr);
trackOffset+=32;
}}
return {
media_catalog_number:media_catalog_number,lead_in:lead_in,is_cd:is_cd,num_tracks:num_tracks,tracks:tracks
};}
function _readCueSheetMetadata_track(p_cue_sheet_track,sb){
var typePremph=Module.getValue(p_cue_sheet_track+22,'i8');
var num_indices=Module.getValue(p_cue_sheet_track+23,'i8');
var indices=[];
var track={
offset:Module.getValue(p_cue_sheet_track,'i64'),number:Module.getValue(p_cue_sheet_track+8,'i8') & 255,isrc:_readConstChar(p_cue_sheet_track+9,13,sb),type:typePremph & 1?'NON_AUDIO':'AUDIO',pre_emphasis:!!(typePremph & 2),num_indices:num_indices,indices:indices
};
var idx;
if(num_indices>0){
idx=Module.getValue(p_cue_sheet_track+24,'i32');
for(var i=0; i<num_indices; ++i){
indices.push({
offset:Module.getValue(idx+(i*16),'i64'),number:Module.getValue(idx+(i*16)+8,'i8')
});}}
return track;
}
function _readPictureMetadata(p_picture_metadata){//-> FLAC__StreamMetadata.type (FLAC__MetadataType) === FLAC__METADATA_TYPE_PICTURE (6)
var type=Module.getValue(p_picture_metadata,'i32');
var mime=Module.getValue(p_picture_metadata+4,'i32');
var sb=[];
var mime_type=_readNullTerminatedChar(mime,sb);
var desc=Module.getValue(p_picture_metadata+8,'i32');
var description=_readNullTerminatedChar(desc,sb);
var width=Module.getValue(p_picture_metadata+12,'i32');
var height=Module.getValue(p_picture_metadata+16,'i32');
var depth=Module.getValue(p_picture_metadata+20,'i32');
var colors=Module.getValue(p_picture_metadata+24,'i32');
var data_length=Module.getValue(p_picture_metadata+28,'i32');
var data=Module.getValue(p_picture_metadata+32,'i32');
var buffer=Uint8Array.from(Module.HEAPU8.subarray(data,data+data_length));
return {
type:type,mime_type:mime_type,description:description,width:width,height:height,depth:depth,colors:colors,data_length:data_length,data:buffer
};}
function __fix_write_buffer(heapOffset,newBuffer,applyFix){
var dv=new DataView(newBuffer.buffer);
var targetSize=newBuffer.length;
var increase=!applyFix?1:2;//<- for FIX/workaround, NOTE: e.g. if 24-bit padding occurres, there is no fix/increase needed (more details comment below)
var buffer=HEAPU8.subarray(heapOffset,heapOffset+targetSize*increase);
var jump,isPrint;
for(var i=0,j=0,size=buffer.length; i<size && j<targetSize; ++i, ++j){
if(i === size-1 && j<targetSize-1){
buffer=HEAPU8.subarray(heapOffset,size+targetSize);
size=buffer.length;
}
if(applyFix && (buffer[i] === 0 || buffer[i] === 255)){
jump=0;
isPrint=true;
if(i+1<size && buffer[i] === buffer[i+1]){
++jump;
if(i+2<size){
if(buffer[i] === buffer[i+2]){
++jump;
}else{
isPrint=false;
}}}
if(isPrint){
dv.setUint8(j,buffer[i]);
if(jump === 2 && i+3<size && buffer[i] === buffer[i+3]){
++jump;
dv.setUint8(++j,buffer[i]);
}
}else{
--j;
}
i+=jump;//<- apply jump, if there were value duplications
}else{
dv.setUint8(j,buffer[i]);
}}}
var FLAC__STREAM_DECODER_READ_STATUS_CONTINUE=0;
var FLAC__STREAM_DECODER_READ_STATUS_END_OF_STREAM=1;
var FLAC__STREAM_DECODER_READ_STATUS_ABORT=2;
var FLAC__STREAM_DECODER_WRITE_STATUS_CONTINUE=0;
var FLAC__STREAM_DECODER_WRITE_STATUS_ABORT=1;
var FLAC__STREAM_DECODER_INIT_STATUS_OK=0;
var FLAC__STREAM_DECODER_INIT_STATUS_UNSUPPORTED_CONTAINER=1;
var FLAC__STREAM_DECODER_INIT_STATUS_INVALID_CALLBACKS=2;
var FLAC__STREAM_DECODER_INIT_STATUS_MEMORY_ALLOCATION_ERROR=3;
var FLAC__STREAM_DECODER_INIT_STATUS_ERROR_OPENING_FILE=4;
var FLAC__STREAM_DECODER_INIT_STATUS_ALREADY_INITIALIZED=5;
var FLAC__STREAM_ENCODER_INIT_STATUS_OK=0;
var FLAC__STREAM_ENCODER_INIT_STATUS_ENCODER_ERROR=1;
var FLAC__STREAM_ENCODER_INIT_STATUS_UNSUPPORTED_CONTAINER=2;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_CALLBACKS=3;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_NUMBER_OF_CHANNELS=4;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_BITS_PER_SAMPLE=5;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_SAMPLE_RATE=6;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_BLOCK_SIZE=7;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_MAX_LPC_ORDER=8;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_QLP_COEFF_PRECISION=9;
var FLAC__STREAM_ENCODER_INIT_STATUS_BLOCK_SIZE_TOO_SMALL_FOR_LPC_ORDER=10;
var FLAC__STREAM_ENCODER_INIT_STATUS_NOT_STREAMABLE=11;
var FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_METADATA=12;
var FLAC__STREAM_ENCODER_INIT_STATUS_ALREADY_INITIALIZED=13;
var FLAC__STREAM_ENCODER_WRITE_STATUS_OK=0;
var FLAC__STREAM_ENCODER_WRITE_STATUS_FATAL_ERROR=1;
var coders={};
function getCallback(p_coder,func_type){
if(coders[p_coder]){
return coders[p_coder][func_type];
}}
function setCallback(p_coder,func_type,callback){
if(!coders[p_coder]){
coders[p_coder]={};
}
coders[p_coder][func_type]=callback;
}
function _getOptions(p_coder){
if(coders[p_coder]){
return coders[p_coder]["options"];
}}
function _setOptions(p_coder,options){
if(!coders[p_coder]){
coders[p_coder]={};
}
coders[p_coder]["options"]=options;
}
var enc_write_fn_ptr=addFunction(function(p_encoder,buffer,bytes,samples,current_frame,p_client_data){
var retdata=new Uint8Array(bytes);
retdata.set(HEAPU8.subarray(buffer,buffer+bytes));
var write_callback_fn=getCallback(p_encoder,'write');
try{
write_callback_fn(retdata,bytes,samples,current_frame,p_client_data);
}catch(err){
console.error(err);
return FLAC__STREAM_ENCODER_WRITE_STATUS_FATAL_ERROR;
}
return FLAC__STREAM_ENCODER_WRITE_STATUS_OK;
},'iiiiiii');
var dec_read_fn_ptr=addFunction(function(p_decoder,buffer,bytes,p_client_data){
var len=Module.getValue(bytes,'i32');
if(len === 0){
return FLAC__STREAM_DECODER_READ_STATUS_ABORT;
}
var read_callback_fn=getCallback(p_decoder,'read');
var readResult=read_callback_fn(len,p_client_data);
var readLen=readResult.readDataLength;
Module.setValue(bytes,readLen,'i32');
if(readResult.error){
return FLAC__STREAM_DECODER_READ_STATUS_ABORT;
}
if(readLen === 0){
return FLAC__STREAM_DECODER_READ_STATUS_END_OF_STREAM;
}
var readBuf=readResult.buffer;
var dataHeap=new Uint8Array(Module.HEAPU8.buffer,buffer,readLen);
dataHeap.set(new Uint8Array(readBuf));
return FLAC__STREAM_DECODER_READ_STATUS_CONTINUE;
},'iiiii');
var dec_write_fn_ptr=addFunction(function(p_decoder,p_frame,p_buffer,p_client_data){
var dec_opts=_getOptions(p_decoder);
var frameInfo=_readFrameHdr(p_frame,dec_opts);
var channels=frameInfo.channels;
var block_size=frameInfo.blocksize*(frameInfo.bitsPerSample/8);
var isFix=frameInfo.bitsPerSample !== 24;
var padding=(frameInfo.bitsPerSample/8)%2;
if(padding>0){
block_size+=frameInfo.blocksize*padding;
}
var data=[];
var bufferOffset,_buffer;
for(var i=0; i<channels; ++i){
bufferOffset=Module.getValue(p_buffer+(i*4),'i32');
_buffer=new Uint8Array(block_size);
__fix_write_buffer(bufferOffset,_buffer,isFix);
data.push(_buffer.subarray(0,block_size));
}
var write_callback_fn=getCallback(p_decoder,'write');
var res=write_callback_fn(data,frameInfo);//, clientData);
return res !== false?FLAC__STREAM_DECODER_WRITE_STATUS_CONTINUE:FLAC__STREAM_DECODER_WRITE_STATUS_ABORT;
},'iiiii');
var DecoderErrorCode={
0:'FLAC__STREAM_DECODER_ERROR_STATUS_LOST_SYNC',1:'FLAC__STREAM_DECODER_ERROR_STATUS_BAD_HEADER',2:'FLAC__STREAM_DECODER_ERROR_STATUS_FRAME_CRC_MISMATCH',3:'FLAC__STREAM_DECODER_ERROR_STATUS_UNPARSEABLE_STREAM'
};
var dec_error_fn_ptr=addFunction(function(p_decoder,err,p_client_data){
var msg=DecoderErrorCode[err] || 'FLAC__STREAM_DECODER_ERROR__UNKNOWN__';//<- this should never happen;
var error_callback_fn=getCallback(p_decoder,'error');
error_callback_fn(err,msg,p_client_data);
},'viii');
var metadata_fn_ptr=addFunction(function(p_coder,p_metadata,p_client_data){
var type=Module.getValue(p_metadata,'i32');//4 bytes
var is_last=Module.getValue(p_metadata+4,'i32');//4 bytes
var length=Module.getValue(p_metadata+8,'i64');//8 bytes
var meta_data={
type:type,isLast:is_last,length:length,data:void (0)
};
var metadata_callback_fn=getCallback(p_coder,'metadata');
if(type === 0){// === FLAC__METADATA_TYPE_STREAMINFO
meta_data.data=_readStreamInfo(p_metadata+16);
metadata_callback_fn(meta_data.data,meta_data);
}else{
var data;
switch(type){
case 1: 
data=_readPaddingMetadata(p_metadata+16);
break;
case 2: 
data=readApplicationMetadata(p_metadata+16);
break;
case 3: 
data=_readSeekTableMetadata(p_metadata+16);
break;
case 4: 
data=_readVorbisComment(p_metadata+16);
break;
case 5: 
data=_readCueSheetMetadata(p_metadata+16);
break;
case 6: 
data=_readPictureMetadata(p_metadata+16);
break;
default:{ 
var cod_opts=_getOptions(p_coder);
if(cod_opts && cod_opts.enableRawMetadata){
var buffer=Uint8Array.from(HEAPU8.subarray(p_metadata+16,p_metadata+16+length));
meta_data.raw=buffer;
}}}
meta_data.data=data;
metadata_callback_fn(void (0),meta_data);
}},'viii');
var listeners={};
var persistedEvents=[];
var add_event_listener=function(eventName,listener){
var list=listeners[eventName];
if(!list){
list=[listener];
listeners[eventName]=list;
}else{
list.push(listener);
}
check_and_trigger_persisted_event(eventName,listener);
};
var check_and_trigger_persisted_event=function(eventName,listener){
var activated;
for(var i=persistedEvents.length-1; i>=0; --i){
activated=persistedEvents[i];
if(activated && activated.event === eventName){
listener.apply(null,activated.args);
break;
}}};
var remove_event_listener=function(eventName,listener){
var list=listeners[eventName];
if(list){
for(var i=list.length-1; i>=0; --i){
if(list[i] === listener){
list.splice(i,1);
}}}};
var do_fire_event=function(eventName,args,isPersist){
if(_exported['on'+eventName]){
_exported['on'+eventName].apply(null,args);
}
var list=listeners[eventName];
if(list){
for(var i=0,size=list.length; i<size; ++i){
list[i].apply(null,args);
}}
if(isPersist){
persistedEvents.push({event:eventName,args:args});
}};
var _exported={
_module:Module,//internal: reference to Flac module
_clear_enc_cb:function(enc_ptr){//internal function: remove reference to encoder instance and its callbacks
delete coders[enc_ptr];
},_clear_dec_cb:function(dec_ptr){//internal function: remove reference to decoder instance and its callbacks
delete coders[dec_ptr];
},
setOptions:_setOptions,
getOptions:_getOptions,
isReady:function(){ return _flac_ready; },
onready:void (0),
on:add_event_listener,
FLAC__stream_encoder_set_verify:function(encoder,is_verify){
is_verify=is_verify?1:0;
Module.ccall('FLAC__stream_encoder_set_verify','number',['number','number'],[encoder,is_verify]);
},
FLAC__stream_encoder_set_compression_level:Module.cwrap('FLAC__stream_encoder_set_compression_level','number',['number','number']),
create_libflac_encoder:function(sample_rate,channels,bps,compression_level,total_samples,is_verify,block_size){
is_verify=typeof is_verify === 'undefined'?1:is_verify+0;
total_samples=typeof total_samples === 'number'?total_samples:0;
block_size=typeof block_size === 'number'?block_size:0;
var ok=true;
var encoder=Module.ccall('FLAC__stream_encoder_new','number',[],[]);
ok&=Module.ccall('FLAC__stream_encoder_set_verify','number',['number','number'],[encoder,is_verify]);
ok&=Module.ccall('FLAC__stream_encoder_set_compression_level','number',['number','number'],[encoder,compression_level]);
ok&=Module.ccall('FLAC__stream_encoder_set_channels','number',['number','number'],[encoder,channels]);
ok&=Module.ccall('FLAC__stream_encoder_set_bits_per_sample','number',['number','number'],[encoder,bps]);
ok&=Module.ccall('FLAC__stream_encoder_set_sample_rate','number',['number','number'],[encoder,sample_rate]);
ok&=Module.ccall('FLAC__stream_encoder_set_blocksize','number',['number','number'],[encoder,block_size]);
ok&=Module.ccall('FLAC__stream_encoder_set_total_samples_estimate','number',['number','number'],[encoder,total_samples]);
if(ok){
do_fire_event('created',[{type:'created',target:{id:encoder,type:'encoder'}}],false);
return encoder;
}
return 0;
},
init_libflac_encoder:function(){
console.warn('Flac.init_libflac_encoder() is deprecated, use Flac.create_libflac_encoder() instead!');
return this.create_libflac_encoder.apply(this,arguments);
},
create_libflac_decoder:function(is_verify){
is_verify=typeof is_verify === 'undefined'?1:is_verify+0;
var ok=true;
var decoder=Module.ccall('FLAC__stream_decoder_new','number',[],[]);
ok&=Module.ccall('FLAC__stream_decoder_set_md5_checking','number',['number','number'],[decoder,is_verify]);
if(ok){
do_fire_event('created',[{type:'created',target:{id:decoder,type:'decoder'}}],false);
return decoder;
}
return 0;
},
init_libflac_decoder:function(){
console.warn('Flac.init_libflac_decoder() is deprecated, use Flac.create_libflac_decoder() instead!');
return this.create_libflac_decoder.apply(this,arguments);
},
init_encoder_stream:function(encoder,write_callback_fn,metadata_callback_fn,ogg_serial_number,client_data){
var is_ogg=(ogg_serial_number === true);
client_data=client_data | 0;
if(typeof write_callback_fn !== 'function'){
return FLAC__STREAM_ENCODER_INIT_STATUS_INVALID_CALLBACKS;
}
setCallback(encoder,'write',write_callback_fn);
var __metadata_callback_fn_ptr=0;
if(typeof metadata_callback_fn === 'function'){
setCallback(encoder,'metadata',metadata_callback_fn);
__metadata_callback_fn_ptr=metadata_fn_ptr;
}
var func_name='FLAC__stream_encoder_init_stream';
var args_types=['number','number','number','number','number','number'];
var args=[encoder,enc_write_fn_ptr,0,//	FLAC__StreamEncoderSeekCallback
0,
__metadata_callback_fn_ptr,client_data];
if(typeof ogg_serial_number === 'number'){
is_ogg=true;
}else if(is_ogg){
ogg_serial_number=1;
}
if(is_ogg){
func_name='FLAC__stream_encoder_init_ogg_stream';
args.unshift(args[0]);
args[1]=0;//	FLAC__StreamEncoderReadCallback
args_types.unshift(args_types[0]);
args_types[1]='number';
Module.ccall('FLAC__stream_encoder_set_ogg_serial_number','number',['number','number'],[encoder,ogg_serial_number]);
}
var init_status=Module.ccall(func_name,'number',args_types,args);
return init_status;
},
init_encoder_ogg_stream:function(encoder,write_callback_fn,metadata_callback_fn,ogg_serial_number,client_data){
if(typeof ogg_serial_number !== 'number'){
ogg_serial_number=true;
}
return this.init_encoder_stream(encoder,write_callback_fn,metadata_callback_fn,ogg_serial_number,client_data);
},
init_decoder_stream:function(decoder,read_callback_fn,write_callback_fn,error_callback_fn,metadata_callback_fn,ogg_serial_number,client_data){
client_data=client_data | 0;
if(typeof read_callback_fn !== 'function'){
return FLAC__STREAM_DECODER_INIT_STATUS_INVALID_CALLBACKS;
}
setCallback(decoder,'read',read_callback_fn);
if(typeof write_callback_fn !== 'function'){
return FLAC__STREAM_DECODER_INIT_STATUS_INVALID_CALLBACKS;
}
setCallback(decoder,'write',write_callback_fn);
var __error_callback_fn_ptr=0;
if(typeof error_callback_fn === 'function'){
setCallback(decoder,'error',error_callback_fn);
__error_callback_fn_ptr=dec_error_fn_ptr;
}
var __metadata_callback_fn_ptr=0;
if(typeof metadata_callback_fn === 'function'){
setCallback(decoder,'metadata',metadata_callback_fn);
__metadata_callback_fn_ptr=metadata_fn_ptr;
}
var is_ogg=(ogg_serial_number === true);
if(typeof ogg_serial_number === 'number'){
is_ogg=true;
Module.ccall('FLAC__stream_decoder_set_ogg_serial_number','number',['number','number'],[decoder,ogg_serial_number]);
}
var init_func_name=!is_ogg?'FLAC__stream_decoder_init_stream':'FLAC__stream_decoder_init_ogg_stream';
var init_status=Module.ccall(init_func_name,'number',['number','number','number','number','number','number','number','number','number','number'],[decoder,dec_read_fn_ptr,0,// 	FLAC__StreamDecoderSeekCallback
0,0,0,
dec_write_fn_ptr,__metadata_callback_fn_ptr,__error_callback_fn_ptr,client_data]);
return init_status;
},
init_decoder_ogg_stream:function(decoder,read_callback_fn,write_callback_fn,error_callback_fn,metadata_callback_fn,ogg_serial_number,client_data){
if(typeof ogg_serial_number !== 'number'){
ogg_serial_number=true;
}
return this.init_decoder_stream(decoder,read_callback_fn,write_callback_fn,error_callback_fn,metadata_callback_fn,ogg_serial_number,client_data);
},
FLAC__stream_encoder_process_interleaved:function(encoder,buffer,num_of_samples){
var numBytes=buffer.length*buffer.BYTES_PER_ELEMENT;
var ptr=Module._malloc(numBytes);
var heapBytes=new Uint8Array(Module.HEAPU8.buffer,ptr,numBytes);
heapBytes.set(new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength));// issue #11 (2): do use byteOffset and byteLength for copying the data in case the underlying buffer/ArrayBuffer of the TypedArray view is larger than the TypedArray
var status=Module.ccall('FLAC__stream_encoder_process_interleaved','number',['number','number','number'],[encoder,heapBytes.byteOffset,num_of_samples]);
Module._free(ptr);
return status;
},
FLAC__stream_encoder_process:function(encoder,channelBuffers,num_of_samples){
var ptrInfo=this._create_pointer_array(channelBuffers);
var pointerPtr=ptrInfo.pointerPointer;
var status=Module.ccall('FLAC__stream_encoder_process','number',['number','number','number'],[encoder,pointerPtr,num_of_samples]);
this._destroy_pointer_array(ptrInfo);
return status;
},
FLAC__stream_decoder_process_single:Module.cwrap('FLAC__stream_decoder_process_single','number',['number']),
FLAC__stream_decoder_process_until_end_of_stream:Module.cwrap('FLAC__stream_decoder_process_until_end_of_stream','number',['number']),
FLAC__stream_decoder_process_until_end_of_metadata:Module.cwrap('FLAC__stream_decoder_process_until_end_of_metadata','number',['number']),
FLAC__stream_decoder_get_state:Module.cwrap('FLAC__stream_decoder_get_state','number',['number']),
FLAC__stream_encoder_get_state:Module.cwrap('FLAC__stream_encoder_get_state','number',['number']),
FLAC__stream_decoder_set_metadata_respond:Module.cwrap('FLAC__stream_decoder_set_metadata_respond','number',['number','number']),
FLAC__stream_decoder_set_metadata_respond_application:Module.cwrap('FLAC__stream_decoder_set_metadata_respond_application','number',['number','number']),// (FLAC__StreamDecoder *decoder, const FLAC__byte id[4])
FLAC__stream_decoder_set_metadata_respond_all:Module.cwrap('FLAC__stream_decoder_set_metadata_respond_all','number',['number']),// (FLAC__StreamDecoder *decoder)
FLAC__stream_decoder_set_metadata_ignore:Module.cwrap('FLAC__stream_decoder_set_metadata_ignore','number',['number','number']),// (FLAC__StreamDecoder *decoder, FLAC__MetadataType type)
FLAC__stream_decoder_set_metadata_ignore_application:Module.cwrap('FLAC__stream_decoder_set_metadata_ignore_application','number',['number','number']),// (FLAC__StreamDecoder *decoder, const FLAC__byte id[4])
FLAC__stream_decoder_set_metadata_ignore_all:Module.cwrap('FLAC__stream_decoder_set_metadata_ignore_all','number',['number']),// (FLAC__StreamDecoder *decoder)
FLAC__stream_encoder_set_metadata:function(encoder,metadataBuffersPointer,num_blocks){// ( FLAC__StreamEncoder *  encoder, FLAC__StreamMetadata **  metadata, unsigned  num_blocks)
var status=Module.ccall('FLAC__stream_encoder_set_metadata','number',['number','number','number'],[encoder,metadataBuffersPointer.pointerPointer,num_blocks]);
return status;
},
_create_pointer_array:function(bufferArray){
var size=bufferArray.length;
var ptrs=[],ptrData=new Uint32Array(size);
var ptrOffsets=new DataView(ptrData.buffer);
var buffer,numBytes,heapBytes,ptr;
for(var i=0,size; i<size; ++i){
buffer=bufferArray[i];
numBytes=buffer.length*buffer.BYTES_PER_ELEMENT;
ptr=Module._malloc(numBytes);
ptrs.push(ptr);
heapBytes=new Uint8Array(Module.HEAPU8.buffer,ptr,numBytes);
heapBytes.set(new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength));
ptrOffsets.setUint32(i*4,ptr,true);
}
var nPointerBytes=ptrData.length*ptrData.BYTES_PER_ELEMENT;
var pointerPtr=Module._malloc(nPointerBytes);
var pointerHeap=new Uint8Array(Module.HEAPU8.buffer,pointerPtr,nPointerBytes);
pointerHeap.set(new Uint8Array(ptrData.buffer));
return {
dataPointer:ptrs,pointerPointer:pointerPtr
};},
_destroy_pointer_array:function(pointerInfo){
var pointerArray=pointerInfo.dataPointer;
for(var i=0,size=pointerArray.length; i<size; ++i){
Module._free(pointerArray[i]);
}
Module._free(pointerInfo.pointerPointer);
},
FLAC__stream_decoder_get_md5_checking:Module.cwrap('FLAC__stream_decoder_get_md5_checking','number',['number']),
FLAC__stream_decoder_set_md5_checking:function(decoder,is_verify){
is_verify=is_verify?1:0;
return Module.ccall('FLAC__stream_decoder_set_md5_checking','number',['number','number'],[decoder,is_verify]);
},
FLAC__stream_encoder_finish:Module.cwrap('FLAC__stream_encoder_finish','number',['number']),
FLAC__stream_decoder_finish:Module.cwrap('FLAC__stream_decoder_finish','number',['number']),
FLAC__stream_decoder_reset:Module.cwrap('FLAC__stream_decoder_reset','number',['number']),
FLAC__stream_encoder_delete:function(encoder){
this._clear_enc_cb(encoder);//<- remove callback references
Module.ccall('FLAC__stream_encoder_delete','number',['number'],[encoder]);
do_fire_event('destroyed',[{type:'destroyed',target:{id:encoder,type:'encoder'}}],false);
},
FLAC__stream_decoder_delete:function(decoder){
this._clear_dec_cb(decoder);
Module.ccall('FLAC__stream_decoder_delete','number',['number'],[decoder]);
do_fire_event('destroyed',[{type:'destroyed',target:{id:decoder,type:'decoder'}}],false);
}};
if(typeof Object.defineProperty === 'function'){
_exported._onready= void (0);
Object.defineProperty(_exported,'onready',{
get(){ return this._onready; },set(newValue){
this._onready=newValue;
if(newValue && this.isReady()){
check_and_trigger_persisted_event('ready',newValue);
}}});
}else{
console.warn('WARN: note that setting Flac.onready handler after Flac.isReady() is already true, will have no effect, that is, the handler function will not be triggered!');
}
if(expLib && expLib.exports){
expLib.exports=_exported;
}
return _exported;
}));
