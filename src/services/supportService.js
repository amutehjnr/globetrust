'use strict';

function createSupportService({ supportRepo }) {
  return {
    async getOrCreateCustomerConversation(userId, subject) {
      let conv = await supportRepo.findOpenByCustomer(userId);
      if (!conv) {
        const id = await supportRepo.createConversation(userId, subject);
        conv = await supportRepo.getConversation(id);
      }
      const messages = await supportRepo.listMessages(conv.id);
      return { conversation: conv, messages };
    },

    async assertCanAccess(user, conversationId) {
      const conv = await supportRepo.getConversation(conversationId);
      if (!conv) {
        const err = new Error('Conversation not found.');
        err.status = 404;
        throw err;
      }
      const roles = user.roles || [];
      const isStaff = roles.some((r) =>
        ['support_agent', 'admin', 'operations'].includes(r)
      );
      if (conv.customerUserId === user.id || isStaff) {
        return conv;
      }
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    },

    async postMessage(user, conversationId, text) {
      const conv = await this.assertCanAccess(user, conversationId);
      if (['closed'].includes(conv.status)) {
        const err = new Error('This conversation is closed.');
        err.status = 400;
        throw err;
      }
      const message = await supportRepo.addMessage({
        conversationId,
        senderUserId: user.id,
        text
      });
      return { conversation: conv, message };
    }
  };
}

module.exports = { createSupportService };
