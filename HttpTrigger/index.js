const request = require('request');

function textResponse(msg){
  return {
    "fulfillmentText": "Full Text response",
    "fulfillmentMessages": [
      {
        "text": {
          "text": [msg]
        }
      }
    ],
    "source": "<Text response>"
  }
};

module.exports = function (context, req) {
    if (req.query.name || (req.body && req.body.name)) {
        request.get({
            url: 'https://jsonplaceholder.typicode.com/todos/1',
        }, function (error, response, body) {
            const respObj = JSON.parse(body);
            const respMsg = textResponse(respObj.title);

            context.res = {
                    status: 200,
                    body: respMsg
                };

            context.done(null, respMsg);
        });
      } else {
       context.res = {
            status: 400,
           body: "Please pass a name on the query string or in the request body"
      };
      context.done(null, '');
    }
};