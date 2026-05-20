# Salon AI Agent — Product Requirements Document

**Product:** SalonAI — AI voice agent for single-operator salons  
**Platform:** agent-line (NestJS + Prisma + PostgreSQL)  
**Version:** 1.0  
**Date:** 2026-05-20  
**Target Market:** Single-operator salons in India → Global

---

## 1. Problem Statement

Single-operator salon owners in India (and globally) run their entire business on their personal phone. When they are with a customer, they miss calls. Every missed call is a lost booking. They have no system — just memory, a separate SIM card, and WhatsApp.

**The pain (Raj's story):**
- 3–5 missed calls per day while cutting hair
- No-show rate ~20% (no reminders sent)
- Empty gaps between customers (no waitlist management)
- Re-engagement: zero (no time to call old customers)
- Monthly revenue lost: ₹15,000–25,000

---

## 2. Solution

An AI agent that answers every call in the customer's language, books appointments, manages the daily queue — all communicated to the owner via WhatsApp. Zero new apps. Zero dashboards. Zero extra work.

**For the salon owner:** WhatsApp is the only interface.  
**For the customer:** The phone number they already call.

---

## 3. Target User

| | Detail |
|---|---|
| Name | Raj (representative persona) |
| Business | Single-operator salon |
| Services | Haircut ₹200, Facial/D-Tan ₹500, custom (told in-person) |
| Hours | 9am – 10pm |
| Phone | Separate SIM for business, always on WhatsApp |
| Tech | Basic Android phone, WhatsApp user, no laptop |
| Languages | Kannada, Hindi, English, Telugu |
| Location | Bangalore (India) → scalable globally |

---

## 4. Languages Supported

| Language | Trigger words | Script |
|---|---|---|
| Kannada | "Namaskara", "beku", "ide" | Full Kannada conversation |
| Hindi | "Namaste", "chahiye", "hai" | Full Hindi conversation |
| English | "Hello", "Hi", "I want" | Full English conversation |
| Telugu | "Namaskaram", "kaavali", "undi" | Full Telugu conversation |

Auto-detection on first utterance. No "press 1 for language" menus.

---

## 5. Complete Use Cases

### UC-01: Inbound Call — New Booking
**Confidence: 9/10**

```
Trigger:  Customer calls salon number
Actor:    New or returning customer

Flow:
1. Customer calls
2. AI answers on first ring (Exotel → Retell)
3. AI detects language from first words
4. AI greets: "Namaskara! Raj Salon. Haircut ₹200, Facial ₹500. Yaavaga bartheera?"
5. Customer says service + time
6. AI confirms slot availability
7. AI asks for name
8. AI confirms: "3 baje confirm Suresh. WhatsApp baruthe."
9. Booking saved to DB (SalonBooking model)
10. WhatsApp to customer: booking confirmation
11. WhatsApp to Raj: "📅 Suresh → Haircut → 3pm"

Edge cases:
- Slot not available → AI offers next 2 available slots
- Customer doesn't know what they want → "Raj helthare, barthaaga. Yaavaga bartheera?"
- Customer asks price → AI states price, offers to book
- Customer calls outside hours → AI says closed, books for next day
```

---

### UC-02: Inbound Call — Existing Customer
**Confidence: 9/10**

```
Trigger:  Known phone number calls again
Actor:    Returning customer

Flow:
1. AI recognizes phone number from Contact table
2. AI greets by name: "Hi Suresh! Haircut as usual?"
3. Customer confirms or changes service
4. AI books slot
5. WhatsApp confirmation sent

Edge case:
- Customer wants different service → AI updates, confirms new price
```

---

### UC-03: Inbound Call — Cancellation
**Confidence: 9/10**

```
Trigger:  Customer calls to cancel
Actor:    Booked customer

Flow:
1. AI recognizes "cancel" intent in any language
2. AI confirms: "3 baje appointment cancel maaDona?"
3. Customer confirms
4. Booking status → cancelled
5. Waitlist check triggered (UC-08)
6. WhatsApp to Raj: "❌ Suresh cancelled 3pm. Calling waitlist..."
7. WhatsApp to customer: "Cancelled ✅. See you next time!"
```

---

### UC-04: Inbound Call — Full Day
**Confidence: 9/10**

```
Trigger:  Customer calls when all slots are taken
Actor:    New customer

Flow:
1. AI checks availability → fully booked
2. AI: "Aaj Raj full book aagiddhare. Naaleige time ide."
3. Offers tomorrow's available slots
4. If customer prefers: adds to today's waitlist
5. "Slot free aadre call maaDthevi."
6. Raj gets: "Priya waitlist ge sericiddhare (today)"
```

---

### UC-05: After-Hours Call
**Confidence: 9/10**

```
Trigger:  Customer calls before 9am or after 10pm
Actor:    Any customer

Flow:
1. AI detects outside working hours
2. AI: "Raj Salon 9am ge teredukoLLuthe. Naaleige booking maaDona?"
3. If yes → books for tomorrow
4. If no → "Okay, 9 bajege call maaDi."
5. Raj gets morning summary including overnight bookings
```

---

### UC-06: Owner Command — Done
**Confidence: 9/10**

```
Trigger:  Raj sends "done" on WhatsApp
Actor:    Raj (salon owner)

Flow:
1. Raj types "done"
2. System checks current time vs next booking
3. If next booking > 20 min away:
   a. Check waitlist for anyone available
   b. Text next booked customer: "Can you come earlier?"
   c. If someone fills gap → notify Raj
   d. If no one → "✅ Free for 35 min. Next: Ravi 4pm."
4. If next booking < 15 min:
   a. "✅ Ravi coming at 4pm. Ready in 15 min."
```

---

### UC-07: Owner Command — Break
**Confidence: 9/10**

```
Trigger:  Raj sends "break 30"
Actor:    Raj

Flow:
1. System sets break for 30 minutes
2. Inbound callers hear: "Raj 30 nimiShada nantara ready iruththaare."
3. AI still takes bookings for post-break slots
4. After 30 min: "✅ Break over. Next: Amit 3:30pm."

Commands supported:
"break 20"  → 20 minute break
"break"     → 15 min default
"back"      → end break immediately
"full"      → no more bookings today
"late 20"   → running 20 min behind, notify all customers
```

---

### UC-08: Waitlist — Auto Gap Fill
**Confidence: 8/10**

```
Trigger:  Cancellation OR early finish (UC-06)
Actor:    System (automatic)

Flow:
1. Slot opens up
2. System checks waitlist in order
3. AI calls first waitlist person:
   "Hi Priya, Raj ke paas abhi slot khali hua.
    Aa sakti ho 20 minute mein?"
4. YES → Booked, Raj notified, others stay on waitlist
5. NO → Next person called
6. Nobody available → Raj gets break notification

Waitlist max: 5 people per day
Waitlist expires: End of day (10pm)
```

---

### UC-09: Day-Before Reminder
**Confidence: 9/10**

```
Trigger:  Automated job at 6pm daily
Actor:    System → all next-day bookings

Flow:
1. System queries all bookings for tomorrow
2. For each: send WhatsApp to customer:
   "Hi Suresh! 👋
    Tomorrow 10am at Raj Salon — Haircut ₹200.
    Still coming? Reply YES / NO"
3. YES → confirmed, no action
4. NO → cancelled, waitlist triggered (UC-08)
5. No reply by 8pm → send reminder call:
   "Naale 10 baje appointment confirm maaDi..."
6. Still no reply → flagged for Raj:
   "⚠️ Suresh (10am) not confirmed yet."
```

---

### UC-10: Same-Day Reminder
**Confidence: 9/10**

```
Trigger:  2 hours before appointment
Actor:    System → customer

Flow:
1. WhatsApp to customer:
   "Hey Suresh! Aaj 3 baje Raj Salon.
    On your way? Reply YES / NO"
2. NO → slot freed, waitlist triggered
3. No reply → AI call 30 min before:
   "Aapka appointment 30 minute mein hai..."
```

---

### UC-11: No-Show Detection
**Confidence: 8/10**

```
Trigger:  15 minutes past appointment, customer not marked arrived
Actor:    System → customer

Flow:
1. System detects overdue appointment
2. AI calls customer:
   "Hi Suresh, Raj aapka intaare.
    Barthiddira?"
3. YES/On way → "Okay, see you soon!"
4. NO → Raj notified, slot freed, waitlist called
5. No answer → 1 retry after 5 min, then slot freed

Note: "Arrived" marked when Raj sends "here [name]" or "arrived"
```

---

### UC-12: Post-Service Feedback
**Confidence: 8/10**

```
Trigger:  2 hours after appointment end time
Actor:    System → customer

Flow:
1. WhatsApp to customer:
   "Suresh, aaj aane ke liye thanks! 🙏
    Kaisa laga? Reply: 1⭐ 2⭐ 3⭐ 4⭐ 5⭐"
2. 4-5 stars → "Thanks! Google review denge?
                [Google Maps link]"
3. 1-2 stars → Raj gets urgent WhatsApp:
               "⚠️ Suresh — 2 stars. Call: 98XXXXXXXX"
4. No reply → No follow-up (don't bug them)
```

---

### UC-13: Re-Engagement (Lapsed Customers)
**Confidence: 8/10**

```
Trigger:  Customer hasn't visited in 28 days
Actor:    System → lapsed customer

Flow:
1. System identifies lapsed customers daily at 10am
2. WhatsApp to customer:
   "Suresh bhai! 👋 Kaafi time ho gaya.
    Raj ke paas is hafte slot khali hai.
    Book karein? Reply YES"
3. YES → AI calls to book
4. NO / No reply → No more messages for 14 days

Limit: Max 1 re-engagement message per 14 days
```

---

### UC-14: Escalation to Raj
**Confidence: 8/10**

```
Trigger:  AI detects situation needs human
Actor:    AI → Raj

Escalation triggers:
- Customer says "owner se baat karni hai" / "Raj avra iddara?"
- Customer is angry (sentiment: frustrated/angry)
- Price negotiation request
- Special/bridal package inquiry
- AI fails to understand after 2 attempts
- Technical error

Flow:
1. AI: "Raj aadashtu bega call maaDthaare. Number bididdhara?"
2. Customer confirms / gives number
3. WhatsApp to Raj: "⚠️ [Customer name] callback beku: 98XXXXXXXX
                     Reason: [price negotiation / angry / special request]"
4. Raj calls when free
5. Customer gets: "Raj 30 nimiShadalli call maaDthaare."
```

---

### UC-15: Morning Schedule Briefing
**Confidence: 9/10**

```
Trigger:  Daily at 8:45am (15 min before opening)
Actor:    System → Raj

WhatsApp to Raj:
"☀️ Good morning Raj!

Today's schedule:
9:30  → Suresh (Haircut)
11:00 → Ravi (Facial)
2:00  → FREE
3:30  → Amit (Haircut)
5:00  → Priya (D-Tan)

5 booked. 3 free slots.
Waitlist: 2 people

Reply 'full' to stop new bookings today."
```

---

### UC-16: End of Day Summary
**Confidence: 9/10**

```
Trigger:  10pm daily (or when Raj sends "done" after last customer)
Actor:    System → Raj

WhatsApp to Raj:
"🌙 Day done, Raj!

✅ Served: 9 customers
❌ No-shows: 1 (Ravi 4pm)
📞 Calls handled by AI: 7
💰 Estimated: ~₹1,800
⭐ Ratings today: 4.6/5

Tomorrow: 3 already booked
First: Suresh 10am

Good night! 💈"
```

---

### UC-17: Walk-in Customer
**Confidence: 7/10**

```
Trigger:  Raj sends "walkin haircut" or "walkin facial"
Actor:    Raj

Flow:
1. System finds next available gap ≥ service duration
2. Creates unconfirmed booking for "Walk-in"
3. If gap found: "✅ Slotted between Suresh(3pm) and Amit(4pm).
                  Next booking pushed 30 min. Notify Amit?"
4. Raj replies "yes" → AI WhatsApps Amit about delay
5. Raj replies "no" → booking added, no notification
```

---

### UC-18: Running Late
**Confidence: 9/10**

```
Trigger:  Raj sends "late 20"
Actor:    Raj

Flow:
1. All remaining today's bookings pushed by 20 minutes
2. AI sends WhatsApp to each affected customer:
   "Hi Suresh, Raj aaj thoda late chal raha hai.
    Aapka time 3pm se 3:20pm ho gaya hai.
    Still okay? Reply YES / NO"
3. NO → cancellation flow triggered
```

---

## 6. What's Already Built in agent-line

| Component | Status | Notes |
|---|---|---|
| Workspace / Project / multi-tenancy | ✅ Built | Each salon = 1 workspace |
| Agent model | ✅ Built | Needs salon-specific fields |
| Call model + tracking | ✅ Built | Core call management |
| Contact model | ✅ Built | Customer phone tracking |
| Billing / Razorpay | ✅ Built | Subscription model ready |
| Auth / API keys / roles | ✅ Built | Admin access |
| Webhook infrastructure | ✅ Built | Retell webhook handler needed |
| PhoneNumber management | ✅ Built | Exotel provider needed |
| Twilio provider | ✅ Built | Exotel to add |
| Retell voice AI | ❌ Missing | **P0 — build first** |
| Exotel provider | ❌ Missing | Indian telephony |
| WhatsApp (Interakt) | ❌ Missing | Core owner interface |
| SalonBooking model | ❌ Missing | New Prisma model |
| SalonProfile model | ❌ Missing | Services, hours, config |
| SalonQueue service | ❌ Missing | Queue + waitlist logic |
| Scheduled jobs (reminders) | ❌ Missing | BullMQ / cron jobs |
| Language detection | ❌ Missing | Retell multi-lang config |

---

## 7. New Database Models Required

```prisma
model SalonProfile {
  id              String    @id
  workspaceId     String
  agentId         String    @unique
  ownerName       String
  salonName       String
  ownerPhone      String    // For WhatsApp notifications
  address         String?
  openTime        String    @default("09:00")
  closeTime       String    @default("22:00")
  languages       String[]  @default(["kannada", "hindi", "english"])
  services        Json      // [{name, price, durationMin}]
  googleMapsUrl   String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  workspace       Workspace @relation(...)
  agent           Agent     @relation(...)
  bookings        SalonBooking[]
  waitlist        SalonWaitlist[]
}

model SalonBooking {
  id              String        @id
  workspaceId     String
  salonProfileId  String
  contactId       String
  customerName    String
  customerPhone   String
  service         String
  priceRs         Int
  durationMin     Int
  scheduledAt     DateTime
  status          BookingStatus @default(pending)
  confirmedAt     DateTime?
  arrivedAt       DateTime?
  completedAt     DateTime?
  cancelledAt     DateTime?
  cancelReason    String?
  reminderSent    Boolean       @default(false)
  feedbackScore   Int?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

model SalonWaitlist {
  id              String    @id
  workspaceId     String
  salonProfileId  String
  customerName    String
  customerPhone   String
  service         String?
  date            DateTime  // Which day they're waiting for
  notifiedAt      DateTime?
  status          WaitlistStatus @default(waiting)
  createdAt       DateTime  @default(now())
}

enum BookingStatus {
  pending
  confirmed
  arrived
  completed
  cancelled
  no_show
}

enum WaitlistStatus {
  waiting
  offered
  booked
  expired
}
```

---

## 8. New Modules to Build

```
src/modules/
├── salon/                        ← NEW
│   ├── salon.module.ts
│   ├── salon-profile.service.ts  (CRUD for salon config)
│   ├── salon-booking.service.ts  (booking logic + queue)
│   ├── salon-queue.service.ts    (done/break/waitlist)
│   ├── salon-whatsapp.service.ts (all WA notifications)
│   ├── salon-scheduler.service.ts(reminders + re-engagement)
│   └── salon-onboarding.service.ts
│
├── providers/
│   ├── retell/                   ← NEW
│   │   ├── retell.service.ts     (Retell API client)
│   │   ├── retell-webhooks.controller.ts
│   │   └── retell-agent-sync.service.ts
│   │
│   ├── exotel/                   ← NEW
│   │   └── exotel.service.ts     (Indian telephony)
│   │
│   └── interakt/                 ← NEW (WhatsApp)
│       └── interakt.service.ts
```

---

## 9. Retell Integration Architecture

```
Customer calls Exotel number
         ↓
Exotel webhook → agent-line
         ↓
agent-line creates Retell call
         ↓
Retell AI handles conversation (voice)
         ↓
Retell calls agent-line webhook (custom LLM)
         ↓
agent-line processes intent:
  - BOOK_APPOINTMENT
  - CANCEL_APPOINTMENT
  - CHECK_AVAILABILITY
  - ADD_TO_WAITLIST
  - ESCALATE_TO_OWNER
         ↓
agent-line responds with:
  - Next AI utterance
  - Booking confirmation
         ↓
Retell speaks response to customer
         ↓
Call ends → agent-line saves Call record
         ↓
WhatsApp notifications sent
```

---

## 10. WhatsApp Command Processing

```
Owner sends → System action
─────────────────────────────────────────────────
"done"           → Gap fill flow (UC-06)
"break 20"       → Set 20 min break (UC-07)  
"break"          → Set 15 min break
"back"           → End break
"full"           → Stop all new bookings today
"late 20"        → Push all bookings 20 min (UC-18)
"cancel 3pm"     → Cancel 3pm booking
"cancel suresh"  → Cancel booking by name
"walkin haircut" → Slot walk-in (UC-17)
"walkin facial"  → Slot walk-in facial
"schedule"       → Show today's bookings
"tomorrow"       → Show tomorrow's bookings
"waitlist"       → Show today's waitlist
"here suresh"    → Mark Suresh as arrived
"handled"        → Dismiss escalation alert
─────────────────────────────────────────────────
Unknown command  → "Sorry, I didn't understand.
                    Send 'schedule' to see bookings."
```

---

## 11. Build Plan with Confidence Scores

### Phase 1 — Foundation (Week 1-2)
**Goal: One real call works end to end**

| Task | Confidence | Effort | Priority |
|---|---|---|---|
| Retell API client + agent creation | 9/10 | 1 day | P0 |
| Retell webhook handler (custom LLM) | 8/10 | 2 days | P0 |
| Intent extraction (BOOK/CANCEL/etc) | 8/10 | 1 day | P0 |
| Exotel provider (Indian numbers) | 7/10 | 1 day | P0 |
| SalonProfile + SalonBooking models | 9/10 | 0.5 day | P0 |
| Basic availability check | 9/10 | 1 day | P0 |
| **End-to-end test: real call books slot** | - | - | P0 |

**Exit criteria:** Call Raj's Exotel number → AI answers → Books haircut → Record in DB

---

### Phase 2 — WhatsApp Layer (Week 3)
**Goal: Raj sees everything on WhatsApp**

| Task | Confidence | Effort | Priority |
|---|---|---|---|
| Interakt WhatsApp API client | 8/10 | 1 day | P0 |
| Booking notification to owner | 9/10 | 0.5 day | P0 |
| Booking confirmation to customer | 9/10 | 0.5 day | P0 |
| WhatsApp command webhook + parser | 8/10 | 1 day | P0 |
| "done" command → gap fill logic | 7/10 | 1 day | P1 |
| "break" command | 8/10 | 0.5 day | P1 |
| **Test: Raj types "done" → AI calls waitlist** | - | - | P0 |

**Exit criteria:** Raj receives WhatsApp for every booking. Types "done" and AI handles next slot.

---

### Phase 3 — Reminders + Queue (Week 4)
**Goal: No-shows drop, queue runs itself**

| Task | Confidence | Effort | Priority |
|---|---|---|---|
| BullMQ / scheduled jobs setup | 8/10 | 1 day | P0 |
| Day-before reminder (6pm job) | 9/10 | 1 day | P0 |
| Same-day reminder (2hr before) | 9/10 | 0.5 day | P0 |
| No-show detection (15min job) | 8/10 | 1 day | P0 |
| Waitlist auto-fill on cancellation | 7/10 | 1 day | P1 |
| Morning schedule briefing | 9/10 | 0.5 day | P1 |
| End of day summary | 9/10 | 0.5 day | P1 |

**Exit criteria:** A booked customer who cancels → slot auto-filled from waitlist within 2 min.

---

### Phase 4 — Intelligence (Week 5)
**Goal: Product feels smart, not scripted**

| Task | Confidence | Effort | Priority |
|---|---|---|---|
| Language auto-detection (4 languages) | 8/10 | 1 day | P0 |
| Returning customer recognition | 8/10 | 0.5 day | P1 |
| Sentiment detection → escalation | 7/10 | 1 day | P1 |
| Post-service feedback collection | 8/10 | 1 day | P1 |
| Re-engagement (28-day lapse) | 8/10 | 1 day | P2 |
| "late 20" command (push all bookings) | 8/10 | 1 day | P1 |
| Walk-in slot handling | 7/10 | 1 day | P2 |

---

### Phase 5 — First Customer (Week 5-6)
**Goal: Raj pays ₹1,999**

| Task | Confidence | Effort | Priority |
|---|---|---|---|
| Salon onboarding flow (WhatsApp-based) | 8/10 | 2 days | P0 |
| Razorpay subscription (₹1,999/month) | 9/10 | 1 day | P0 |
| Demo script + live demo setup | 9/10 | 0.5 day | P0 |
| Monitoring + alerts to builder | 8/10 | 1 day | P0 |

**Exit criteria:** Raj's salon is live. First payment received. 5 real calls handled.

---

## 12. Onboarding Flow (WhatsApp-based, 10 minutes)

```
Step 1: Raj messages AI number
        "Hi, I want to set up"

Step 2: AI guides via WhatsApp:
        "What's your salon name?"
        → "Raj Hair Salon"

        "Your services and prices?"
        → "Haircut 200, Facial 500"

        "Working hours?"
        → "9am to 10pm"

        "Your address for customers?"
        → "12 MG Road, Koramangala"

Step 3: AI sets up Retell agent automatically
        Configures all 4 languages
        Sets up conversation flow

Step 4: "Your AI number is ready: +91 80 XXXX XXXX
         Forward your calls to this number.
         Dial: **61*+9180XXXXXXXX#
         
         Done? Send 'test' to try a demo call."

Step 5: Raj dials the code, sends "test"
        Demo call plays
        
Step 6: Live 🎉
```

---

## 13. Pricing

| Plan | Price | Included |
|---|---|---|
| Starter | ₹1,999/month | 500 min AI calls, 1000 WhatsApp msgs |
| Growth | ₹3,999/month | 1500 min AI calls, 3000 WhatsApp msgs |
| Overage | ₹4/min | Beyond included minutes |

---

## 14. Success Metrics

| Metric | Target (Month 1) | Target (Month 3) |
|---|---|---|
| Active salon customers | 1 (Raj) | 20 |
| Calls handled by AI/day | >5 per salon | >8 per salon |
| No-show rate | <10% | <8% |
| Owner WhatsApp commands/day | <10 | <8 |
| Avg setup time | <30 min | <15 min |
| Monthly churn | 0% | <5% |

---

## 15. What We Are NOT Building (v1.0)

- No web dashboard for salon owner (WhatsApp only)
- No customer-facing app
- No payment collection (cash/UPI handled by Raj)
- No multi-staff salon support
- No inventory management
- No hospital / clinic / car showroom (separate PRD)
- No analytics dashboard (summary via WhatsApp only)

---

## 16. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Retell doesn't support Kannada well | Medium | High | Test before commit; fallback to Google STT |
| Exotel call forwarding latency | Low | High | Test with real SIM before onboarding |
| Interakt WhatsApp delivery delays | Medium | Medium | Retry logic + fallback SMS |
| Owner doesn't trust AI with their number | High | High | First month free, easy off-switch |
| Customer hangs up before AI answers | Low | Medium | Ensure < 1 second answer time |
| Raj forgets to type "done" | Medium | Medium | Auto-detect via call duration patterns |

---

*End of Document*
