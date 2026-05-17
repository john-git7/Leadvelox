import { z } from 'zod';
import { parsePhoneNumber } from 'libphonenumber-js';

export const leadSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please provide a valid email address").transform(e => e.trim().toLowerCase()),
  phone: z.string().min(10, "Please provide a valid phone number").max(20).transform(p => {
    try {
      const phoneNumber = parsePhoneNumber(p, 'US');
      if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.format('E.164');
      }
    } catch (e) {}
    return p;
  }),
  source: z.string().min(1, "Please select a source"),
});

export type LeadInput = z.infer<typeof leadSchema>;
