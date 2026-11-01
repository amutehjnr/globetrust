'use strict';

function createSupportService({ supportRepo, customerRepo, logger }) {
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

    async postMessage(user, conversationId, text, attachment = null) {
      const conv = await this.assertCanAccess(user, conversationId);
      if (['closed'].includes(conv.status)) {
        const err = new Error('This conversation is closed.');
        err.status = 400;
        throw err;
      }

      let messageType = 'text';
      let attachmentUrl = null;
      let attachmentName = null;
      let attachmentMime = null;

      if (attachment && attachment.url) {
        attachmentUrl = attachment.url;
        attachmentName = attachment.originalName || attachment.name || 'attachment';
        attachmentMime = attachment.mime || null;
        messageType = String(attachmentMime || '').startsWith('image/') ? 'image' : 'file';
      }

      const message = await supportRepo.addMessage({
        conversationId,
        senderUserId: user.id,
        text,
        messageType,
        attachmentUrl,
        attachmentName,
        attachmentMime
      });

      // Bell: staff → customer, or customer → staff (staff uses admin inbox; customer gets staff replies)
      try {
        const roles = user.roles || [];
        const isStaff = roles.some((r) =>
          ['support_agent', 'admin', 'operations'].includes(r)
        );
        if (
          isStaff &&
          conv.customerUserId &&
          customerRepo &&
          typeof customerRepo.createNotification === 'function'
        ) {
          const preview = String(text || attachmentName || 'New message').slice(0, 180);
          await customerRepo.createNotification({
            userId: conv.customerUserId,
            type: 'support',
            title: 'Support replied',
            body: preview
          });
        }
      } catch (nErr) {
        if (logger && logger.warn) logger.warn({ err: nErr }, 'Support notification failed');
      }

      return { conversation: conv, message };
    }
  };
}

module.exports = { createSupportService };