'use strict';

const icons = {
  service: '<path d="M703 140H538V66c0-25-20-46-46-46H276c-26 0-46 21-46 46v74H65c-36 0-65 29-65 64v479c0 36 29 65 65 65h638c36 0 65-29 65-65V204c0-35-29-64-65-64ZM265 66c0-6 5-10 11-10h216c6 0 11 4 11 10v74h-21V95c0-10-8-18-18-18H304c-10 0-18 8-18 18v45h-21Zm181 46v28H322v-28Zm287 571c0 16-14 29-30 29H65c-16 0-30-13-30-29V454c18 9 25 7 100 7v52c0 10 8 18 18 18h85c9 0 17-8 17-18v-52h258v52c0 10 8 18 17 18h85c10 0 18-8 18-18v-52c75 0 82 2 100-7ZM171 496V392h49v104Zm377 0V392h49v104Zm185-100c0 17-14 30-30 30h-70v-52c0-10-8-18-18-18h-85c-9 0-17 8-17 18v52H255v-52c0-10-8-18-17-18h-85c-10 0-18 8-18 18v52H65c-16 0-30-13-30-30V204c0-16 14-29 30-29h638c16 0 30 13 30 29Zm0 0"/>',
};

module.exports = {

  // Friendly name
  name: 'Services',

  // Brief description of this plugin
  purpose: 'Showcase the services that your company offers',

  // Version of this plugin
  version: '1.0.0',

  // Name of the plugin author
  author: 'Romein van Buren',

  // Name of vendor of this plugin
  vendor: 'Smart Yellow',

  // Array of plugins this plugin depends on
  requires: [ 'webdesq/sessions', 'webdesq/storage' ],

  // Features this plugin offers
  features: {
    seeMyServices: {
      description: 'See my services',
    },
    seeAllServices: {
      description: 'See all services',
    },
    editServices: {
      description: 'Edit services',
      requires: [ [ 'seeMyServices', 'seeAllServices' ] ],
    },
    createServices: {
      description: 'Create services',
      requires: 'editServices',
    },
    deleteServices: {
      description: 'Delete services',
      requires: 'createServices',
    },
  },

  settings: {
    preview: {
      type: 'string',
      label: 'preview url',
      default: '',
    },
    channels: {
      type: 'keys',
      label: 'channels',
      default: {},
    },
  },

  icon: icons.service,

  entities: {
    service: 'service.js',
  },

  gui: {
    modules: () => [
      { path: 'services.svelte',
        requires: [ 'seeMyServices', 'seeAllServices' ],
        menu: {
          cluster: 'content',
          icon: icons.service,
          title: 'all services',
        },
      },
    ],
  },

  routes: ({ server, settings }) => [

    // Get all services I'm allowed to see
    { route: '/services',
      method: 'get',
      requires: [ 'smartyellow/services/seeMyServices', 'smartyellow/services/seeAllServices' ],
      handler: async (req, res, user) => {
        const q = server.storage({ user }).store('smartyellow/service').find().sort({ 'log.created.on': -1 });
        const result = await (req.headers['format'] == 'object' ? q.toObject() : q.toArray());
        res.json(result);
      },
    },

    { route: '/services/settings',
      method: 'get',
      purpose: 'Receive all predefined settings for services',
      requires: [ 'smartyellow/services/seeMyServices', 'smartyellow/services/seeAllServices' ],
      handler: async (req, res) => {
        res.json({
          previewUrl: settings.preview,
        });
      },
    },

    // Get specific service
    { route: '/services/:id',
      method: 'get',
      requires: [ 'smartyellow/services/seeMyServices', 'smartyellow/services/seeAllServices' ],
      handler: async (req, res, user) => {
        const doc = await server.storage({ user }).store('smartyellow/service').get(req.params[0]);
        if (!doc) {
          res.error(404);
          return;
        }
        if (user.cannot('smartyellow/services/seeAllServices')) {
          const set = [ user.id, ...(user.coworkers || []) ];
          if (!set.includes(doc.log.created.by)) {
            // no access to this service, send 'not authorized' error
            res.error(401);
            return;
          }
        }
        // validate item
        const result = await server.validateEntity({
          entity: 'smartyellow/service',
          id: req.params[0],
          data: doc,
          validateOnly: true,
          user: user,
          isNew: false,
        });
        res.json(result);
      },
    },

    // Create new service
    { route: '/services',
      method: 'post',
      requires: 'smartyellow/services/createServices',
      handler: async (req, res, user) => {

        let result = await server.validateEntity({
          validateOnly: req.headers['init'],
          isNew: true,
          entity: 'smartyellow/service',
          user: user,
          data: req.body,
        });

        // If validation was OK and we're not in initMode, store the new values
        if (result.store) {
          result = await result.store();
          delete result.store;
          // broadcast reload trigger
          server.publish('cms', 'smartyellow/services/reload');
        }

        res.json(result);
      },
    },

    // Update existing service
    { route: '/services/:id',
      method: 'put',
      requires: 'smartyellow/services/editServices',
      handler: async (req, res, user) => {

        const result = await server.validateEntity({
          entity: 'smartyellow/service',
          id: req.params[0],
          data: req.body,
          isNew: false,
          storeIfValid: true,
          validateOnly: req.headers['init'],
          user: user,
        });

        if (!result.errors) {
          // broadcast reload trigger
          server.publish('cms', 'smartyellow/services/reload');
        }

        res.json(result);
      },
    },

    // Delete specific service
    { route: '/services/:id',
      method: 'delete',
      requires: 'smartyellow/services/deleteServices',
      handler: async (req, res, user) => {
        // Check if user is allowed to see service to be deleted
        const services = await server.storage({ user }).store('smartyellow/service').find().toObject();
        if (services[req.params[0]]) {
          // User is allowed to see the service to be deleted, continue
          await server.storage({ user }).store('smartyellow/service').delete({ id: req.params[0] });
          // broadcast reload trigger
          server.publish('cms', 'smartyellow/services/reload');
        }
        else {
          // Not authorized
          res.error(401);
        }
      },
    },

    { route: '/services/filters',
      method: 'get',
      requires: [ 'smartyellow/services/seeMyServices', 'smartyellow/services/seeAllServices' ],
      handler: async (req, res, user) => {
        const filters = await server.getFilters({
          entity: 'smartyellow/service',
          user: user,
        });
        res.json(filters);
      },
    },

    { route: '/services/formats',
      method: 'get',
      purpose: 'Get columns defined for entity smartyellow/service',
      handler: async (req, res, user) => {
        const formats = await server.getFormats({
          entity: 'smartyellow/service',
          user: user,
        });
        res.json(formats);
      },
    },

    { route: '/services/search',
      method: 'post',
      requires: [ 'smartyellow/services/seeMyServices', 'smartyellow/services/seeAllServices' ],
      handler: async (req, res, user) => {
        // Get query and language from posted data
        const { query } = req.body;
        const filters = await server.getFilters({
          entity: 'smartyellow/service',
          user: user,
        });
        const storageQuery = server.storage({ user }).prepareQuery(filters, query, req.body.languages || false);
        const find = server.storage({ user }).store('smartyellow/service').find(storageQuery);
        const result = await (req.headers['format'] == 'object' ? find.toObject() : find.toArray());
        res.json(result);
      },
    },

  ],

};
