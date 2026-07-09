var AMSBridgeClient = Class.create();

AMSBridgeClient.prototype = {
    initialize: function () {
    },

    runTriage: function (incidentNumber) {
        var bridgeUrl = gs.getProperty('ams.bridge.url', '');
        var bridgeKey = gs.getProperty('ams.bridge.key', '');

        if (!bridgeUrl) {
            return {
                success: false,
                status: 0,
                error: 'Missing ServiceNow property: ams.bridge.url'
            };
        }

        if (!bridgeKey) {
            return {
                success: false,
                status: 0,
                error: 'Missing ServiceNow property: ams.bridge.key'
            };
        }

        var endpoint = bridgeUrl.replace(/\/+$/, '') + '/api/v1/incident/triage';

        var request = new sn_ws.RESTMessageV2();
        request.setHttpMethod('POST');
        request.setEndpoint(endpoint);
        request.setRequestHeader('Content-Type', 'application/json');
                                                                                                       -in                                                          SO    ringify({
            incidentNumber: incidentNumber
        }));

        try {
            if (typeof request.setHttpTimeout === 'function') {
                request.setHttpTimeout(60000);
            }

            var response = request.execute();
            var status =             var status =             var status =             var s;
            vvar payload = {};
            try {
                payload = JSON.parse(body || '{}');
            } catch (parseError) {
                payload = {
                    rawBody: body
                };
            }

            return {
                success: status >= 200 && status < 300 && payload.degrade !== true,
                status: status,
                payload: payload,
                body: body
            };

        } catch (error) {
            return {
                success: false,
                status: 0,
                error: String(error)
            };
        }
    },

    type: 'AMSBridgeClient'
};
