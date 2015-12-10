var JiraApi = require('jira').JiraApi,
    querystring = require('querystring'),
    _ = require('lodash');

var globalPickResults = {
    'id': 'id',
    'self': 'self',
    'body': 'body',
    'created': 'created',
    'updated': 'updated',
    'author': {
        keyName: 'author',
        fields: ['name']
    },
    'visibility': {
        keyName: 'visibility',
        fields: ['value']
    }
};

module.exports = {

    /**
     * Return auth object.
     *
     *
     * @param dexter
     * @returns {*}
     */
    authParams: function (dexter) {
        var auth = {
            protocol: dexter.environment('jira_protocol', 'https'),
            host: dexter.environment('jira_host'),
            port: dexter.environment('jira_port', 443),
            user: dexter.environment('jira_user'),
            password: dexter.environment('jira_password'),
            apiVers: dexter.environment('jira_apiVers', '2')
        };

        if (!dexter.environment('jira_host') || !dexter.environment('jira_user') || !dexter.environment('jira_password')) {

            this.fail('A [jira_protocol, jira_port, jira_apiVers, *jira_host, *jira_user, *jira_password] environment has this module (* - required).');

            return false;
        } else {

            return auth;
        }
    },

    /**
     * Return pick result.
     *
     * @param output
     * @param pickTemplate
     * @returns {*}
     */
    pickResult: function (output, pickTemplate) {

        var result = _.isArray(pickTemplate)? [] : {};
        // map template keys
        _.map(pickTemplate, function (templateValue, templateKey) {

            var outputValueByKey = _.get(output, templateValue.keyName || templateValue, undefined);

            if (_.isUndefined(outputValueByKey)) {

                result = _.isEmpty(result)? undefined : result;
                return;
            }


            // if template key is object - transform, else just save
            if (_.isArray(pickTemplate)) {

                result = outputValueByKey;
            } else if (_.isObject(templateValue)) {
                // if data is array - map and transform, else once transform
                if (_.isArray(outputValueByKey)) {
                    var mapPickArrays = this._mapPickArrays(outputValueByKey, templateKey, templateValue);

                    result = _.isEmpty(result)? mapPickArrays : _.merge(result, mapPickArrays);
                } else {

                    result[templateKey] = this.pickResult(outputValueByKey, templateValue.fields);
                }
            } else {

                _.set(result, templateKey, outputValueByKey);
            }
        }, this);

        return result;
    },

    /**
     * System func for pickResult.
     *
     * @param mapValue
     * @param templateKey
     * @param templateObject
     * @returns {*}
     * @private
     */
    _mapPickArrays: function (mapValue, templateKey, templateObject) {
        var arrayResult = [],
            result = templateKey === '-'? [] : {};

        _.map(mapValue, function (inOutArrayValue) {
            var pickValue = this.pickResult(inOutArrayValue, templateObject.fields);

            if (pickValue !== undefined)
                arrayResult.push(pickValue);
        }, this);

        if (templateKey === '-') {

            result = arrayResult;
        } else {

            result[templateKey] = arrayResult;
        }

        return result;
    },

    processStatus: function (error, response, body) {

        if (error) {
            this.fail(error);
            return;
        }

        if (response.statusCode === 400) {
            this.fail("Invalid Fields: " + JSON.stringify(body));
            return;
        }

        if (response.statusCode === 201) {

            this.complete(this.pickResult(body, globalPickResults));
            return;
        }

        this.fail(response.statusCode + ': Error while adding comment');
    },

    /**
     * The main entry point for the Dexter module
     *
     * @param {AppStep} step Accessor for the configuration for the step using this module.  Use step.input('{key}') to retrieve input data.
     * @param {AppData} dexter Container for all data used in this workflow.
     */
    run: function(step, dexter) {
        var issue = step.input('issue').first();
        var comment = step.input('body').first();
        var expand = step.input('expand').first();

        var auth = this.authParams(dexter);

        if (!auth) {

            return;
        }
        
        var jira = new JiraApi(auth.protocol, auth.host, auth.port, auth.user, auth.password, auth.apiVers);

        if (issue && comment) {
            var jiraUri = '/issue/' + issue + '/comment';

            if (expand)
                jiraUri = jiraUri.concat('?' + querystring.encode({expand: expand}));

            var options = {
                rejectUnauthorized: jira.strictSSL,
                uri: jira.makeUri(jiraUri),
                body: {
                    "body": comment
                },
                method: 'POST',
                followAllRedirects: true,
                json: true
            };

            jira.doRequest(options, function(error, response, body) {

                this.processStatus(error, response, body);
            }.bind(this));
        } else {

            this.fail('A [issue, body] is required for this module');
        }
    }
};
