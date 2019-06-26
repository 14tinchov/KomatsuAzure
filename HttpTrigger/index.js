const request = require('request');
const xml2js = require('xml2js');

const CaService = {
  base_url: 'https://webintegration.sonda.com:8050/caisd-rest',

  handleRequest: function(userEmail, intentName, params) {
    switch(intentName) {
      case 'can_do.query_tickets.user':
        return this.getTicketsByEmail(userEmail)
      case 'can_do.query_tickets.id':
        return this.getTicketByID(params['ticket_id'])
      case 'can_do.tkt_sys.create':
        return this.createTicket(userEmail, params['ticketSummary'], params['ticketDescription'])
    }
  },

  basicAuth: function(){
    return {
        user: 'integ_kcl',
        password: 'KCL.2019'
      }
  },
  
  headersToCommonRequest: function(){
    return {
      'content-type': 'application/xml',
      'cache-control': 'no-cache',
    }
  },

  headersWithToken: function(access_token) {
    return {
        'content-type': 'application/xml',
        'cache-control': 'no-cache',
        'X-AccessKey':  access_token,
        'X-Obj-Attrs': 'ref_num, status, summary, description, assignee, affected_contact, requestor, requested_by, log_agent'
    }
  },

  headersToCreateTicket: function(access_token){
    return {
      'content-type': 'application/xml',
      'cache-control': 'no-cache',
      'X-AccessKey': access_token,
      'X-Obj-Attrs': 'ref_num, status, summary, description, assignee, affected_contact, requestor, requested_by, log_agent'
    }
  },
      
  parseXML: function(service, responseXML) {
    const ca = this;
    return new Promise(resolve => {
      xml2js.parseString(responseXML, function (err, result) {
        if (service == 'token' && !err){
          resolve(result.rest_access.access_key[0]);
        } else if (service == 'user_id' && !err) {
          resolve(result.collection_cnt.cnt[0]['$'].id.split("'")[1])
        } else if (service == 'tickets_by_email' && !err) {
          console.log(result);
          console.log(result.collection_cr.cr);
          const count = result.collection_cr['$']['COUNT']
          if (count == '0') {
            resolve('Usted no tiene tickets');
          } else {
            resolve(ca.msgTicketsList(result.collection_cr.cr));
          };
        } else if (service == 'tickets_by_id' && !err) {
          console.log(result);
          const count = result.collection_cr['$']['COUNT']
          if (count == '0') {
            resolve('No hay información acerca de ese ticket');
          } else {
            resolve(ca.msgTicket(result.collection_cr.cr[0]));
          };
        } else if (service == 'create_ticket' && !err) {
          resolve('Su ticket ha sido creado.');
        }
      });
    });
  },

  msgTicket: function(ticket) {
    const ticket_id = ticket['$']['COMMON_NAME'];
    const summary = ticket.summary[0];
    const status = ticket.status[0]['$']["COMMON_NAME"];
    const assignee_name = '-';

    return JSON.stringify({
      "type_message": "card",
      "card":
        { "header": "Información del ticket",
          "body": {
            "title": `#${ticket_id}`,
            "description": `${summary}`, 
            "specialList": [
              {"title_item": "Estado", "content": `${status}`},
              {"title_item": "Asignado a", "content": `${assignee_name}`}
            ]
          }
        }
    });
  },

  msgTicketsList: function(tickets) {
    const arrayTickets = tickets.map(ticket => ({
        id: ticket['$']['COMMON_NAME'],
        status: ticket.status[0]['$']["COMMON_NAME"]
        //summary: ticket.summary[0],
      })
    );

    return JSON.stringify({
      "type_message": "card",
      "card":
        { "header": "Información de los tickets",
          "body": {
            "description": "El estado de los tickets es el siguiente", 
            "normalList": {
              "headers": ["ID", "Estado"],
              "items": arrayTickets
            }
          }
        }
    })
  },

  performRequest: function(url, service){
    const ca = this;

    return new Promise(resolve => {
      this.getToken().then(token => {
        request.get({
          url: url,
          headers: ca.headersWithToken(token)
        }, function (error, response, body) {
            resolve(ca.parseXML(service, body))
        });
      });
    });
  },
  
  getToken: function() {
    const ca = this;
    const path = '/rest_access';
    const fullURL = this.base_url + path;

    return new Promise(resolve => {
      request.post({
        url: fullURL,
        headers: ca.headersToCommonRequest(),
        auth: ca.basicAuth(),
        body: '<rest_access/>'
      }, function (error, response, body) {
          if(!error)
            resolve(ca.parseXML('token', body));
      });
    });
  },

  getUserIdByEmail: function(userEmail) {
    let path = `/cnt?WC=email_address%3D'${userEmail}'`;
    const fullURL = this.base_url + path;
    return this.performRequest(fullURL, 'user_id');
  },

  getTicketsByEmail: function (userEmail) {
    const path = `/cr?WC=customer.userid%3D'${userEmail}'%20AND%20status%20%3C%3E%20%27CL%27%20AND%20status%20%3C%3E%20%27RE%27%20AND%20status%20%3C%3E%20%27CNCL%27`;
    const fullURL = this.base_url + path;
    
    return this.performRequest(fullURL, 'tickets_by_email');
  },

  getTicketByID: function (ticketID) {
    const path = `/cr?WC=ref_num%3D'${ticketID}'`;
    const fullURL = this.base_url + path;
    
    return this.performRequest(fullURL, 'tickets_by_id');
  },

  createTicket: function (email, summary, description) {
    const ca = this;
    const path = '/in';
    const fullURL = this.base_url + path;

    return new Promise(resolve => {
      this.getToken().then(accessToken => {
        this.getUserIdByEmail(email).then( uid => {
          const body = `
            <in>
              <customer REL_ATTR='${uid}'/>
              <requested_by REL_ATTR='${uid}'/>
              <summary>${summary}</summary>
              <description>${description}</description>
              <category REL_ATTR='pcat:1121115027'/>
              <zreporting_met REL_ATTR='7302'/>
            </in>
          `;

          request.post({
            url: fullURL,
            headers: ca.headersToCreateTicket(accessToken),
            auth: ca.basicAuth(),
            body: body
          }, function (error, response, body) {
              if(!error)
                resolve(ca.parseXML('create_ticket', body));
          });
        });
      });
    });
  },
};

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

function getEmailFromSession(sessionString){
  return sessionString.split('/').pop()
};

function debugResponse(req, context){
  const deb = JSON.stringify(req);
  const respMsg = textResponse(deb);
  context.res = { status: 200, body: respMsg };
  context.done(null, respMsg);
};

module.exports = function (context, req) {
  if (req.body.session && req.body.queryResult.intent.displayName) {
    const intentName = req.body.queryResult.intent.displayName
    const userEmail = getEmailFromSession(req.body.session)
    const params = req.body.queryResult.parameters

    CaService.handleRequest(userEmail, intentName, params).then(value => {
      const respMsg = textResponse(value);
      context.res = { status: 200, body: respMsg };
      context.done(null, respMsg);
    })

    //debugResponse(req, context)
  } else {
    const errorMsg = 'Ha ocurrido un error, vuelve a intentarlo.';
    context.res = { status: 400, body: textResponse(errorMsg) };
    context.done(null, errorMsg);
  }
};