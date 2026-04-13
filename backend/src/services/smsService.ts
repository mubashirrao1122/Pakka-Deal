// SMS notifications via Twilio
// For hackathon: if Twilio not configured, logs to console instead

interface SMSMessage {
  to:      string; // Pakistan number like +923001234567
  message: string;
}

async function sendSMS(params: SMSMessage): Promise<boolean> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

  // If Twilio not configured, just log (hackathon fallback)
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log(`[SMS MOCK] To: ${params.to}`);
    console.log(`[SMS MOCK] Message: ${params.message}`);
    return true;
  }

  try {
    const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      body: params.message,
      from: TWILIO_PHONE_NUMBER,
      to:   params.to,
    });
    return true;
  } catch (error) {
    console.error('SMS send failed:', error);
    return false;
  }
}

export const smsService = {

  async dealCreated(phone: string, dealId: number, title: string): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal: Aapki deal #${dealId} "${title}" create ho gayi. Buyer ko link share karein. pakkadeal.app/deal/${dealId}`,
    });
  },

  async fundsLocked(phone: string, dealId: number, amountPkr: string): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal: ₨${amountPkr} deal #${dealId} mein lock ho gaye. Smart contract secure kar raha hai. koi bhi withdraw nahi kar sakta.`,
    });
  },

  async milestoneReleased(
    phone:      string,
    dealId:     number,
    milestone:  number,
    amountPkr:  string
  ): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal: Deal #${dealId} Milestone ${milestone} complete. ₨${amountPkr} aapke wallet mein transfer ho gaye.`,
    });
  },

  async dealComplete(phone: string, dealId: number): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal: Deal #${dealId} successfully complete ho gaya! Aapka Pakka Score update ho gaya. pakkadeal.app/profile`,
    });
  },

  async dealDefaulted(phone: string, dealId: number): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal Alert: Deal #${dealId} mein grace period expire ho gayi. Penalty automatically apply ho gayi. pakkadeal.app/deals/${dealId}`,
    });
  },

  async disputeRaised(phone: string, dealId: number): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal: Deal #${dealId} pe dispute raise hua. Saare funds freeze hain. 72 ghante mein evidence submit karein. pakkadeal.app/deals/${dealId}/dispute`,
    });
  },

  async graceExpiringSoon(
    phone:        string,
    dealId:       number,
    hoursLeft:    number
  ): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal Reminder: Deal #${dealId} ka grace period sirf ${hoursLeft} ghante mein khatam ho ga. Delivery confirm karein ya dispute raise karein.`,
    });
  },

  async scoreImproved(
    phone:     string,
    newScore:  number,
    tier:      string
  ): Promise<boolean> {
    return sendSMS({
      to: phone,
      message: `Pakka Deal: Mubarak ho! Aapka Pakka Score ${newScore}/1000 ho gaya. Tier: ${tier}. Agle deal pe kam collateral lagega.`,
    });
  },
};
