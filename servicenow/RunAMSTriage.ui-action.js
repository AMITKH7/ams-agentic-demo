(function executeAction(current, action) {
    var incidentNumber = current.getValue('number');

    if (!incidentNumber) {
        gs.addErrorMessage('AMS triage could not start because incident number is missing.');
        action.setRedirectURL(current);
        return;
    }

    var result = new AMSBridgeClient().runTriage(incidentNumber);

    if (result.success) {
        var payload = result.payload || {};

        gs.addInfoMessage(
            'AMS triage completed. Trace ID: ' +
            (payload.traceId || 'not available') +
            ', Mode: ' +
            (payload.analysisMode || 'unknown') +
            ', Jira: ' +
            (payload.jiraIssueKey || 'not available')
        );

    } else {
        current.work_notes =
            'AMS triage trigger failed from ServiceNow UI Action.\n' +
            'HTTP Status: ' + (result.status || 'not available') + '\n' +
            'Error: ' + (result.error || 'not available') + '\n' +
            'Body: ' + (result.body || 'not available');

        current.update();

        gs.addErrorMessage(
            'AMS triage failed. Check work notes and bridge logs.'
        );
    }

    action.setRedirectURL(current);

})(current, action);