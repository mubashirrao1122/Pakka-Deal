// SMS Notifications — Mock implementation (Twilio removed)
// All SMS messages are logged to console for hackathon demo.
// Replace with a real provider (Twilio, Vonage, etc.) for production.

export const sendSms = async (to: string, message: string): Promise<boolean> => {
  console.log(`[MOCK SMS] To: ${to} | Message: ${message}`);
  return true;
};

export const smsService = {

  async dealCreated(phone: string, dealId: number, title: string): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal: Aapki deal #${dealId} "${title}" create ho gayi. Buyer ko link share karein. pakkadeal.app/deal/${dealId}`,
    );
  },

  async fundsLocked(phone: string, dealId: number, amountPkr: string): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal: ₨${amountPkr} deal #${dealId} mein lock ho gaye. Smart contract secure kar raha hai. koi bhi withdraw nahi kar sakta.`,
    );
  },

  async milestoneReleased(
    phone:      string,
    dealId:     number,
    milestone:  number,
    amountPkr:  string
  ): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal: Deal #${dealId} Milestone ${milestone} complete. ₨${amountPkr} aapke wallet mein transfer ho gaye.`,
    );
  },

  async dealComplete(phone: string, dealId: number): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal: Deal #${dealId} successfully complete ho gaya! Aapka Pakka Score update ho gaya. pakkadeal.app/profile`,
    );
  },

  async dealDefaulted(phone: string, dealId: number): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal Alert: Deal #${dealId} mein grace period expire ho gayi. Penalty automatically apply ho gayi. pakkadeal.app/deals/${dealId}`,
    );
  },

  async disputeRaised(phone: string, dealId: number): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal: Deal #${dealId} pe dispute raise hua. Saare funds freeze hain. 72 ghante mein evidence submit karein. pakkadeal.app/deals/${dealId}/dispute`,
    );
  },

  async graceExpiringSoon(
    phone:        string,
    dealId:       number,
    hoursLeft:    number
  ): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal Reminder: Deal #${dealId} ka grace period sirf ${hoursLeft} ghante mein khatam ho ga. Delivery confirm karein ya dispute raise karein.`,
    );
  },

  async scoreImproved(
    phone:     string,
    newScore:  number,
    tier:      string
  ): Promise<boolean> {
    return sendSms(
      phone,
      `Pakka Deal: Mubarak ho! Aapka Pakka Score ${newScore}/1000 ho gaya. Tier: ${tier}. Agle deal pe kam collateral lagega.`,
    );
  },
};
