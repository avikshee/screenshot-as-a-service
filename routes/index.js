var utils = require('../lib/utils');
var join = require('path').join;
var fs = require('fs');
var path = require('path');
var request = require('request');

module.exports = function(app) {
  var rasterizerService = app.settings.rasterizerService;
  var fileCleanerService = app.settings.fileCleanerService;
  var resizerService = app.settings.resizerService;

  // routes
  app.get('/', function(req, res, next) {
    if (!req.param('url', false)) {
      return res.redirect('/usage.html');
    }

    var url = utils.url(req.param('url'));
    // required options
    var options = {
      uri: 'http://localhost:' + rasterizerService.getPort() + '/',
      headers: { url: url }
    };
    ['width', 'height', 'clipRect', 'javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password', 'delay'].forEach(function(name) {
      if (req.param(name, false)) options.headers[name] = req.param(name);
    });
    
    // Framing options to clip and resize
    var frame = {
        resizeWidth: req.param('resizeWidth', false) ? parseInt(req.param('resizeWidth'), 10) : 0,
        resizeHeight: req.param('resizeHeight', false) ? parseInt(req.param('resizeHeight'), 10) : 0,
        clipWidth: req.param('clipWidth', false) ? parseInt(req.param('clipWidth'), 10) : 0,
        clipHeight: req.param('clipHeight', false) ? parseInt(req.param('clipHeight'), 10) : 0
    };

    var filename = 'screenshot_' + utils.md5(url + JSON.stringify(options) + JSON.stringify(frame)) + '.png';
    options.headers.filename = filename;

    var filePath = join(rasterizerService.getPath(), filename);

    var callbackUrl = req.param('callback', false) ? utils.url(req.param('callback')) : false;

    var refresh = req.param('refresh', false) ? true : false;
    
    if (!refresh && path.existsSync(filePath)) {
      console.log('Request for %s - Found in cache', url);
      processImageUsingCache(filePath, res, callbackUrl, function(err) { 
            if (err) return next(err); 
            
      });
      return;
    }
    console.log('Request for %s - Rasterizing it', url);
    processImageUsingRasterizer(options, filePath, res, callbackUrl, frame, function(err) { 
        if(err) {
            console.log('Retry!');
            setTimeout(processImageUsingRasterizer(options, filePath, res, callbackUrl, frame, function(err) { 
                if(err) return next(new Error(err.message + ' on ' + JSON.stringify(options)));
            }), 1000);
        } 
    });
  });

  app.get('*', function(req, res, next) {
    // for backwards compatibility, try redirecting to the main route if the request looks like /www.google.com
    res.redirect('/?url=' + req.url.substring(1));
  });

  // bits of logic
  var processImageUsingCache = function(filePath, res, url, callback) {
    if (url) {
      // asynchronous
      res.send('Will post screenshot to ' + url + ' when processed');
      postImageToUrl(filePath, url, callback);
    } else {
      // synchronous
      sendImageInResponse(filePath, res, callback);
    }
  };

  var processImageUsingRasterizer = function(rasterizerOptions, filePath, res, url, frame, callback) {
    if (url) {
      // asynchronous
      res.send('Will post screenshot to ' + url + ' when processed');
      callRasterizer(rasterizerOptions, function(error) {
        if (error) return callback(error);
        resizerService.resize(filePath, frame, function(error) {
            if(error) {
                return callback(error);
            }
            postImageToUrl(filePath, url, callback);
        });
      });
    } else {
      // synchronous
      callRasterizer(rasterizerOptions, function(error) {
        if (error) return callback(error);
        resizerService.resize(filePath, frame, function(error) {
            if(error) {
                return callback(error);
            }
            sendImageInResponse(filePath, res, callback);
        });
      });
    }
  };

  var callRasterizer = function(rasterizerOptions, callback) {
    request.get(rasterizerOptions, function(error, response, body) {
      if (error || response.statusCode != 200) {
        console.log('Error while requesting the rasterizer: %s', error.message);
        rasterizerService.restartService();
        return callback(new Error(body));
      }
      callback(null);
    });
  };

  var postImageToUrl = function(imagePath, url, callback) {
    console.log('Streaming image to %s', url);
    var fileStream = fs.createReadStream(imagePath);
    fileStream.on('end', function() {
      fileCleanerService.addFile(imagePath);
    });
    fileStream.on('error', function(err){
      console.log('Error while reading file: %s', err.message);
      callback(err);
    });
    fileStream.pipe(request.post(url, function(err) {
      if (err) console.log('Error while streaming screenshot: %s', err);
      callback(err);
    }));
  };

  var sendImageInResponse = function(imagePath, res, callback) {
    console.log('Sending image in response');
    res.sendfile(imagePath, function(err) {
        if(err) {
            return callback(err);
        }
        fileCleanerService.addFile(imagePath);
        callback(null);
    });
  };

};