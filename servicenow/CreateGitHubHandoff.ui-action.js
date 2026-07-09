(function executeAction(current, action) {
    var incidentNumber = current.getValue('number');

    if (!incidentNumber) {
        gs.addErrorMessage('GitHub handoff could not start because incident number is missing.');
        action.setRedirectURL(current);
        return;
    }

    var result = new AMSBridgeClient().createGitHubHandoff(
        incidentNumber,
        gs.getUserName()
    );

    if (result.success) {
        var payload = result.payload || {};
        var issue = payload.githubIssue || {};

        gs.addInfoMessage(
            'GitHub/Copilot handoff created. Issue: ' +
            (issue.html_url || 'not available') +
            ', Trace ID: ' +
            (payload.traceId || 'not available')
        );

    } else {
        current.work_notes =
            'GitHub/Copilot handoff failed from ServiceNow UI Action.\n' +
            'HTTP Status: ' + (result.status || 'not available') + '\n' +
            'Error: ' + (result.error || 'not available') + '\n' +
            'Body: ' + (result.body || 'not available');

        current.update();

        gs.addErrorMessage(
            'GitHub/Copilot handoff failed. Check work notes and bridge logs.'
        );
    }

    action.setRedirectURL(current);

})(current, action);