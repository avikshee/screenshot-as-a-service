/**
 * NODE_ENV=production PORT=3000 forever start -l /tmp/screengen.log -o /tmp/screengen.out.log -e /tmp/screengen.err.log -w -a app.js
 * /

/**
 * Module dependencies.
 */
var config = require('config');
var express = require('express');
var RasterizerService = require('./lib/rasterizerService');
var FileCleanerService = require('./lib/fileCleanerService');
var ResizerService = require('./lib/resizerService');

process.on('uncaughtException', function (err) {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

process.on('SIGTERM', function () {
  process.exit(0);
});

process.on('SIGINT', function () {
  process.exit(0);
});

// web service
var app = express.createServer();
app.configure(function(){
  app.use(express.static(__dirname + '/public'))
  app.use(app.router);
  app.set('rasterizerService', new RasterizerService(config.rasterizer).startService());
  app.set('fileCleanerService', new FileCleanerService(config.cache.lifetime));
  app.set('resizerService', new ResizerService());
});
app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});
require('./routes')(app);
app.listen(process.env.PORT);
console.log('Express server listening on port ' + process.env.PORT + ' in ' + process.env.NODE_ENV);