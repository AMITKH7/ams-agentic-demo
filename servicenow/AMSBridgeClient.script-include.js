var AMSBridgeClient = Class.create();

AMSBridgeClient.prototype = {
    initialize: function () {
    },

    runTriage: function (incidentNumber) {
        return this._postToBridge('/api/v1/incident/triage', {
            incidentNumber: incidentNumber
        });
    },

    createGitHubHandoff: function (incidentNumber, approvedBy) {
        return this._postToBridge('/api/v1/remediation/handoff', {
            incidentNumber: incidentNumber,
            approvedBy: approvedBy || gs.getUserName()
        });
    },

    _postToBridge: function (path, payload) {
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

        var endpoint = bridgeUrl.replace(/\/+$/, '') + path;

        var request = new sn_ws.RESTMessageV2();
        request.setHttpMethod('POST');
        request.setEndpoint(endpoint);
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('Accept', 'application/json');
        request.setRequestHeader('x-ams-internal-key', bridgeKey);
        request.setRequestBody(JSON.stringify(payload));

        try {
            if (typeof request.setHttpTimeout === 'function') {
                request.setHttpTimeout(60000);
            }

            var response = request.execute();
            var status = response.getStatusCode();
            var body = response.getBody();

            var parsed = {};
            try {
                parsed = JSON.parse(body || '{}');
            } catch (parseError) {
                parsed = {
                    rawBody: body
                };
            }

            return {
                success: status >= 200 && status < 300 && parsed.degrade !== true,
                status: status,
                payload: parsed,
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