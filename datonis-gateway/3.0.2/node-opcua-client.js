"use strict";
var opcua = require("node-opcua");
var async = require("async");
var http = require("http");

var client;
var endpointUrl = "opc.tcp://localhost:49320";

var the_session;
var serverCertificate;

function create_opc_ua_session(callback) {
	var userIdentity = null; // anonymous
	client.createSession(userIdentity, function (err, session) {
		if (!err) {
			the_session = session;
			console.log(" session created".yellow);
			console.log(" sessionId : ", session.sessionId.toString());
		} else {
			callback(err);
		}
	});
}
async.series([

	function (callback) {

        client = new opcua.OPCUAClient();

        console.log(" connecting to ", endpointUrl.cyan.bold);
        client.connect(endpointUrl, callback);
    },

    function (callback) {
        client.getEndpointsRequest(function (err, endpoints) {

            if (!err) {
                endpoints.forEach(function (endpoint, i) {
                    serverCertificate = endpoint.serverCertificate;
                });
            }

            callback(err);
        });
    },
    //------------------------------------------
    function (callback) {
        client.disconnect(callback);
    },

    // reconnect using the correct end point URL now
    function (callback) {

        var options = {
            securityMode: opcua.MessageSecurityMode.get('SIGNANDENCRYPT'),
            securityPolicy: opcua.SecurityPolicy.get('Basic128Rsa15'),
            serverCertificate: serverCertificate,
			defaultSecureTokenLifetime: 2000,
			requestedSessionTimeout: 3600000
        };
        console.log("Options = ", options.securityMode.toString(), options.securityPolicy.toString());

        client = new opcua.OPCUAClient(options);

        console.log(" reconnecting to ", endpointUrl.cyan.bold);
        client.connect(endpointUrl, callback);
    },

    //------------------------------------------
    function (callback) {
		create_opc_ua_session(callback);
    } 
],
function(err) {
	if (err) {
        console.log(" failure ",err);
    } else {
        console.log("done!");
    }
    client.disconnect(function(){});
});

function send_response(response, response_code, data) {
    try {
        response.writeHead(response_code, {"Content-Type": "application/json"});
		console.log(JSON.stringify(data))
        response.write(JSON.stringify(data));
        response.end();
    } catch (err) {
        console.log("Error while sending response back: " + err);
    }
}

function read_and_send(response, nodes_to_read) {
	var max_age = 0;
	the_session.read(nodes_to_read, max_age, function(err, n1,dataValues) {
		if (!err) {
			var ret = []
			dataValues.forEach(function(v, i) {
				//console.log("Value at ", i,  " is ", v);
				ret.push({ value: v.value.value, timestamp: v.sourceTimestamp.getTime()})
			});
			//console.log("Response: ", ret)
			send_response(response, 200, ret);			           	
		} else {
			if (err.response.responseHeader.serviceResult.value == 2149908480) {
				console.log("Session expired, recreating...")
				create_opc_ua_session(undefined);
				read_and_send(response, nodes_to_read);
			} else {
				send_response(response, 500, err);
			}
		}
	});
}

var server = http.createServer(function(request, response) {
    if (request.method == "POST") {
        var body = "";
        request.on('data', function(chunk) {
            body += chunk;
        });
        request.on('end', function() {
			var tags = JSON.parse(body)
			console.log("Request: ", tags)
			
	       	var nodes_to_read = []
			tags.forEach(function(tag, i){
				//console.log("Adding tag: ", tag)
	          	nodes_to_read.push({ nodeId: tag, attributeId: 13}) 
			});
			read_and_send(response, nodes_to_read);
       	});
    }
});

server.listen(8080);
console.log("Server is now listening");

