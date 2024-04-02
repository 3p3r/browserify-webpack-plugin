var url = require('url');
var http = require('http');

var https = module.exports;

for (var key in http) {
  if (http.hasOwnProperty(key)) https[key] = http[key];
}

https.request = function (params: any, cb: any) {
  params = validateParams(params);
  return http.request.call(this, params, cb);
};

https.get = function (params: any, cb: any) {
  params = validateParams(params);
  return http.get.call(this, params, cb);
};

function validateParams(params: any) {
  if (typeof params === 'string') {
    params = url.parse(params);
  }
  if (!params.protocol) {
    params.protocol = 'https:';
  }
  if (params.protocol !== 'https:') {
    throw new Error('Protocol "' + params.protocol + '" not supported. Expected "https:"');
  }
  return params;
}
