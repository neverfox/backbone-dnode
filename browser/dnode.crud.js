//  Backbone-DNode
//  (c) 2011 Beau Sorensen
//  Backbone-DNode may be freely distributed under the MIT license.
//  For all details and documentation:
//  https://github.com/sorensen/backbone-dnode

(function() {
  // CRUD Middleware
  // ---------------
  
  // Save a reference to the global object.
  var root = this
  
  // The top-level namespace. All public classes and modules will
  // be attached to this.
  var crud
  
  // Remote server socket connection reference
  var server
  
  // Storage container for subscribed models, allowing the returning method 
  // calls from the server know where and how to find the model in question
  var Store = root.Store || (root.Store = {})
  
  // Require Underscore, if we're on the server, and it's not already present.
  var _ = root._
  if (!_ && (typeof require !== 'undefined')) _ = require('underscore')._
  
  // Require Backbone, if we're on the server, and it's not already present.
  var Backbone = root.Backbone
  if (!Backbone && (typeof require !== 'undefined')) Backbone = require('backbone')
  
  // Wrap an optional error callback with a fallback error event.
  var wrapError = function(onError, model, options) {
    return function(resp) {
      if (onError) {
        onError(model, resp, options)
      } else {
        model.trigger('error', model, resp, options)
      }
    }
  }

  // Wrap an optional success callback with a fallback success event.
  var wrapFinished = function(onFinished, model, options) {
    return function(resp) {
      if (onFinished) {
        onFinished(model, resp, options)
      } else {
        model.trigger('success', model, resp, options)
      }
    }
  }

  // Add to the main namespace with the CRUD middleware
  // for DNode, accepts a socket client and connection
  crud = function(client, con) {
    // Set a reference to the remote connection
    server = client

    _.extend(this, {
    
      //###created
      // A model has been created on the server,
      // get the model or collection based on channel 
      // name or url to set or add the new data
      created: function(resp, options) {
        var model = Store[options.channel]
        // Model processing
        if (model instanceof Backbone.Model) {
          model.set(model.parse(resp))
        // Collection processing
        } else if (model instanceof Backbone.Collection) {
          if (!model.get(resp.id)) model.add(model.parse(resp))
        }
      },
      
      //###read
      // The server has responded with data from a 
      // model or collection read event, set or add 
      // the data to the model based on channel
      read: function(resp, options) {
        var model = Store[options.channel]
        // Model Processing
        if (model instanceof Backbone.Model) {
          model.set(model.parse(resp))
        // Collection processing
        } else if (model instanceof Backbone.Collection) {
          if (_.isArray(resp)) {
            model.reset(model.parse(resp))
          } else if (!model.get(resp.id)) {
            model.add(model.parse(resp))
          }
        }
      },
      
      //###updated
      // A model has been updated with new data from the
      // server, set the appropriate model or collection
      updated: function(resp, options) {
        var model = Store[options.channel]
        // Collection processing
        if (model.get(resp.id)) {
          model.get(resp.id).set(model.parse(resp))
        // Model processing
        } else {
          model.set(model.parse(resp))
        }
      },
      
      //###destroyed
      // A model has been destroyed, trigger the `destroy` event
      deleted: function(resp, options) {
        var model = Store[options.channel]
        if (model instanceof Backbone.Model) {
          model.trigger('destroy', model, model.collection, options)
          delete Store[options.channel]
        } else if (model instanceof Backbone.Collection) {
          if (model.get(resp.id)) {
            model.trigger('destroy', model.get(resp.id), model, options)
          }
        }
      }
    })
  }
  
  // Add to underscore utility functions to allow optional usage
  // This will allow other storage options easier to manage, such as
  // 'localStorage'. This must be set on the model and collection to 
  // be used on directly. Defaults to 'Backbone.sync' otherwise.
  _.mixin({
    
    //###sync
    // Set the model or collection's sync method to communicate through DNode
    sync: function(method, model, options) {
      // Remove the Backbone id from the model as not to conflict with 
      // Mongoose schemas, it will be re-assigned when the model returns
      // to the client side
      if (model.attributes && model.attributes._id) delete model.attributes.id
      
      // Set the RPC options for model interaction
      options.type || (options.type = model.type || model.collection.type)
      options.channel || (options.channel = (model.collection) ? _.getUrl(model.collection) : _.getUrl(model))
      options.method = method
      options.error = wrapError(options.error, model, options)
      options.finished = wrapFinished(options.finished, model, options)
      if (!server) {
        options.error('no connection')
        return
      }
      // Delegate method call based on action
      server[method](model.toJSON(), options, function(resp) {
        // The server has finished, but we still need 
        // to wait for the `resp` to be added by Backbone
        if (method === 'read') options.success(resp)
        else options.finished(resp)
      })
    }
  })
  
  // Exported for both CommonJS and the browser.
  if (typeof exports !== 'undefined') module.exports = crud
  else root.crud = crud

})()