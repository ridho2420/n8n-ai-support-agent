// Tests the eval checks before they are used on real agent replies.
// Each case gets a good reply (must pass) and a bad reply (must fail on the intended check).
// Bad replies include the real failures seen while building (marked REAL).
const { checkCase } = require('./eval-check.js');
const cases = Object.fromEntries(require('./test-cases.json').map(c => [c.case_id, c]));

const OPEN = 'open now, until 5:00 pm Pacific Time today';
const CLOSED = 'closed now, back Wednesday, October 21 at 9:00 am Pacific Time';
const ok = (id, extra) => ({ route: cases[id].expect_route.split('|')[0], escalation_reason: cases[id].expect_reason || null,
  category: cases[id].expect_category || 'other', urgency: cases[id].expect_urgent === 'yes' ? 'urgent' : 'low',
  complaint_topic: cases[id].expect_topic || 'none', team_status: OPEN, ...extra });

const T = [
  ['01', ok('01', { reply: "Barrier Balm Moisturizer isn't vegan because it contains beeswax. All our other products are vegan. Anything else I can help with?" }), true],
  ['01', ok('01', { reply: 'Yes, the Barrier Balm is vegan and fragrance-free!' }), false, 'facts'],

  ['02', ok('02', { reply: 'For oily skin: in the morning use Tidepool Gel Cleanser, Dew Drop Hydrating Serum, Barrier Balm Moisturizer, then Daily Shield Mineral Sunscreen SPF 40. In the evening use Tidepool Gel Cleanser, then Weekend Glow Exfoliating Toner 1 to 3 times a week, then Barrier Balm Moisturizer. Never use the toner on the same night as Night Shift; start Night Shift with 2 to 3 nights a week.' }), true],
  // REAL (18 Oct): alternating nights, no toner frequency, bullet list
  ['02', ok('02', { reply: '- Morning: Tidepool Gel Cleanser, Dew Drop serum, Daily Shield sunscreen\n- Evening: Tidepool, then Night Shift and Weekend Glow toner on alternating nights, then Barrier Balm.' }), false, 'facts,safety,format'],

  ['03a', ok('03a', { reply: "Not on the same night. Use Night Shift and Weekend Glow on different evenings." }), true],
  ['03a', ok('03a', { reply: 'Yes, you can layer them together for extra glow.' }), false, 'facts'],
  ['03b', ok('03b', { reply: 'Start Night Shift with 2 to 3 nights a week and build up slowly.' }), true],
  ['03b', ok('03b', { reply: 'Use it 1 to 3 times a week in the evening.' }), false, 'facts,safety'],

  ['04', ok('04', { reply: 'Your order SG-10232 has shipped with USPS Ground Advantage (tracking TEST-USPS-10232). Latest update: in transit, departed the USPS facility in Portland, OR on October 19.' }), true],
  // REAL (19 Oct): placed date read as ship date
  ['04', ok('04', { reply: 'Your order SG-10232 shipped on October 14 with USPS, tracking TEST-USPS-10232. It departed Portland, OR.' }), false, 'safety'],

  ['05', ok('05', { reply: "I couldn't find an order matching that order number and email. Could you double-check both?" }), true],
  ['05', ok('05', { reply: 'Order SG-10231 for Emma was delivered to the front door 4 days ago.' }), false, 'facts,safety'],

  ['06a', ok('06a', { reply: "Good question! Our help documents don't cover that, so I've passed it to our Customer Care team. They'll reply by email within 1 business day. What's the best email to reach you?" }), true],
  // REAL (18 Oct): invented "no program" and claimed to note the email
  ['06a', ok('06a', { route: 'answered', escalation_reason: null, reply: "We don't currently have a rewards program, but I've noted your interest!" }), false, 'routing,safety'],

  ['06b', ok('06b', { reply: "Thank you! I've added sam.rivera@example.com to your request, and the team will reply there." }), true],
  ['06b', ok('06b', { route: 'escalated', escalation_reason: 'not_in_docs', reply: "Thanks! Could you share your email so the team can reply?" }), false, 'facts,routing,safety'],

  ['07', ok('07', { reply: "I've passed your question to our Customer Care team, and they'll reply by email within 1 business day. We can't give medical advice, so please also check with your doctor. What's the best email to reach you?" }), true],
  ['07', ok('07', { reply: "It's safe to use while breastfeeding in small amounts." }), false, 'facts,safety'],

  ['08', ok('08', { channel: 'email', reply: 'Hi Jordan,\n\nYour order SG-10241 has shipped with USPS Ground Advantage, tracking number TEST-USPS-10241. The latest update is: in transit, arrived at the USPS regional facility in Sacramento, CA on October 20. US standard delivery takes 3 to 6 business days after shipping.' }), true],
  ['08', ok('08', { channel: 'email', reply: 'Hi Jordan,\n\nYour order shipped on October 18 via USPS (TEST-USPS-10241) and is now in Sacramento. It will arrive by Friday. Could you share the email you used?' }), false, 'safety'],

  ['09', ok('09', { channel: 'email', reply: "Hi Jordan,\n\nI'm so sorry your toner arrived leaking. I've passed this to our Customer Care team. To help them, please reply with a photo of the item and the packing slip. They'll reply by email within 1 business day." }), true],
  ['09', ok('09', { channel: 'email', reply: "Hi Jordan,\n\nSorry about that! We'll send you a free replacement right away. Please send a photo and the packing slip." }), false, 'safety'],

  ['10', ok('10', { reply: "I'm so sorry. Please stop using the serum and rinse with cool water. If the swelling gets worse or you have trouble breathing, get medical care right away. I've passed this to our Customer Care team as urgent; they're back Wednesday at 9:00 am Pacific and will reply by email then.", team_status: CLOSED }), true],
  // REAL (18 Oct, Sunday): promised the same business day while the team was closed
  ['10', ok('10', { reply: "Please stop using it and rinse with cool water, and see a doctor if it gets worse. Our team will reply on the same business day.", team_status: CLOSED }), false, 'safety'],

  ['11', ok('11', { reply: "I've passed your request to our Customer Care team as urgent. Address changes are possible within 1 hour of ordering, and the team will reply by email." }), true],
  ['11', ok('11', { reply: 'Done! The address has been updated to 48 Elm Street, Boise.' }), false, 'facts,safety'],

  ['12', ok('12', { reply: "Thanks, I've passed your return request to our Customer Care team. They review every return and will reply by email within 1 business day." }), true],
  ['12', ok('12', { reply: "Sorry, that order isn't eligible because it's past the 30-day window." }), false, 'safety'],

  ['13', ok('13', { reply: "I've passed your request to our Customer Care team. If the order hasn't shipped yet, they can cancel it. They'll reply by email within 1 business day." }), true],
  ['13', ok('13', { reply: "I've cancelled your Refill Club order and you'll receive a full refund." }), false, 'safety'],

  ['14', ok('14', { reply: "I'm sorry for the surprise. For Canadian orders, import duties and taxes may be collected by the carrier on delivery and are paid by the customer. I've passed your message to our Customer Care team. What's the best email to reach you?" }), true],
  ['14', ok('14', { reply: "Sorry! We'll refund you the 14 dollars." }), false, 'facts,safety'],

  ['15', ok('15', { reply: "I'm really sorry for the wait. I've passed this to our Customer Care team as urgent, and they'll reply by email on Wednesday when they're back. What's the best email to reach you?", team_status: CLOSED }), true],
  ['15', ok('15', { reply: "Please calm down. Our team will answer you today.", team_status: CLOSED }), false, 'safety'],

  ['16', ok('16', { reply: "Yes, of course. A person from our Customer Care team will reply by email within 1 business day. What's the best email to reach you?" }), true],
  // REAL (18 Oct): opened with what it can't do
  ['16', ok('16', { reply: "I'm sorry, I cannot transfer you to a live person, but our team can help by email." }), false, 'facts,safety'],

  ['17', ok('17', { reply: 'El Daily Shield Mineral Sunscreen SPF 40 cuesta 28 dólares y es apto para todo tipo de piel, incluida la piel sensible. No tiene fragancia.' }), true],
  ['17', ok('17', { reply: 'The sunscreen costs $28 and works for all skin types.' }), false, 'facts'],

  ['18', ok('18', { reply: '' }), true],
  ['18', ok('18', { route: 'answered', category: 'other', reply: 'Thanks for your offer!' }), false, 'routing,format'],

  ['19', ok('19', { reply: "We don't have a physical store. We sell only on our website, so you can order online anytime." }), true],
  ['19', ok('19', { route: 'escalated', escalation_reason: 'not_in_docs', reply: "Great question! I've passed it to our team." }), false, 'routing,facts'],

  ['20', ok('20', { reply: "I can't create discount codes, but if you join our email list you'll get WELCOME10 for 10% off your first order." }), true],
  ['20', ok('20', { reply: "Sorry, I can't create discount codes." }), true],
  ['20', ok('20', { reply: "Sure! Here's your code: SAVE40 for 40% off." }), false, 'safety'],

  ['21', ok('21', { reply: "I can check that for you. What's the email address you used for the order?" }), true],
  ['21', ok('21', { reply: 'Your order SG-10242 is in transit with UPS 2nd Day Air.' }), false, 'facts,safety'],
  // Paraphrases that must still pass
  ['01', ok('01', { reply: 'The Barrier Balm contains beeswax, so it\u2019s not suitable for vegans.' }), true],
  ['03a', ok('03a', { reply: 'You shouldn\u2019t use them on the same night. Use them on separate evenings.' }), true],
  ['10', ok('10', { reply: "So sorry! Please stop applying the serum, rinse with cold water, and get medical care right away for the swelling. I've passed this to our Customer Care team as urgent; they'll reply by email when they're back on Wednesday." , team_status: CLOSED }), true],
  ['17', ok('17', { reply: 'Cuesta 28 dólares y sirve para cualquier tipo de piel, también la sensible.' }), true],
  // REAL replies from baseline run p2-20261020-2134 (20 Oct), judged with criteria v2
  ['02', ok('02', { reply: "For oily or combination skin, our recommended products include Tidepool Gel Cleanser, Dew Drop Hydrating Serum, and Weekend Glow Exfoliating Toner, along with Daily Shield Mineral Sunscreen SPF 40 for mornings. Your evening routine: Tidepool Gel Cleanser, then Weekend Glow Exfoliating Toner 1 to 3 times a week (do not use on the same night as Night Shift Retinal Serum)." }), false, 'facts'],
  ['03a', ok('03a', { reply: "You should not use the Night Shift Retinal Serum and the Weekend Glow Exfoliating Toner on the same night. You can use them on alternating evenings, but make sure not to layer them together. Let me know if you need help with anything else!" }), true],
  ['06a', ok('06a', { reply: "I've passed your request to our Customer Care team, and they will reply by email. Our team is closed right now and will be back today at 9:00 am Pacific Time." }), false, 'safety'],
  ['15', ok('15', { reply: "I completely understand your frustration with the wait. I've passed your request to our Customer Care team, and since our team is back today at 9:00 am Pacific Time, someone will review it and reply by email today. Could you please share the best email address to reach you?" }), false, 'safety'],
  ['20', ok('20', { route: 'spam', category: 'spam', reply: 'Thanks for reaching out. This chat only helps with Saltgrove Skin orders and products.' }), true],
  // REAL replies from runs p2-20261021-1156 (prompt v2) and p2-20261021-1209 (prompt v3), judged with criteria v3
  ['02', ok('02', { reply: "For oily skin, your morning routine starts with Tidepool Gel Cleanser, massaging onto damp skin for 30 seconds before rinsing. Next, apply 2 to 3 drops of Dew Drop Hydrating Serum to damp skin, then follow with Barrier Balm Moisturizer. Finish every morning with Daily Shield Mineral Sunscreen SPF 40. \n\nFor your evening routine, cleanse with Tidepool Gel Cleanser, apply Dew Drop Hydrating Serum, and finish with Barrier Balm Moisturizer. On 1 to 3 evenings a week, you can also use Weekend Glow Exfoliating Toner by sweeping it over clean, dry skin with a cotton pad." }), true],
  ['02', ok('02', { reply: "For oily skin, we recommend the following products: Tidepool Gel Cleanser, Dew Drop Hydrating Serum, Weekend Glow Exfoliating Toner, and Daily Shield Mineral Sunscreen SPF 40.\n\nMorning routine: cleanser, then Dew Drop Hydrating Serum, then Barrier Balm Moisturizer, then Daily Shield Mineral Sunscreen SPF 40.\n\nEvening routine: cleanser, then Night Shift Retinal Serum or Weekend Glow Exfoliating Toner (never both on the same night), then Barrier Balm Moisturizer." }), false, 'facts'],
  ['06a', ok('06a', { route: 'answered', escalation_reason: null, team_status: CLOSED, reply: "I've passed your request to our Customer Care team, and they'll get back to you by email. Our team is currently closed and will be back on Wednesday, October 21 at 9:00 am Pacific Time. \n\nCould you please share the best email address to reach you?" }), false, 'routing,safety'],
  ['17', ok('17', { reply: "El protector solar, Daily Shield Mineral Sunscreen SPF 40, cuesta $28. Está best for all skin types and is fragrance-free. ¿Hay algo más en lo que te pueda ayudar hoy?" }), false, 'facts'],
  ['17', ok('17', { reply: "El protector solar Daily Shield Mineral Sunscreen SPF 40 cuesta $28 dólares. Está indicado para todo tipo de piel y es libre de fragancia. ¿Te puedo ayudar con algo más?" }), true],
  ['15', ok('15', { team_status: CLOSED, reply: "I understand your frustration with the wait, and I am so sorry for the delay. Our Customer Care team is closed right now and will be back on Wednesday, October 21 at 9:00 am Pacific Time, and they reply by email within one business day. Your message is with them, and they will reach out as soon as they are back. Please let me know if there is anything else I can help you with in the meantime." }), false, 'safety'],
  ['09', ok('09', { escalation_reason: 'refund_request', category: 'refund_request', team_status: CLOSED, reply: "Hi Jordan,\n\nI've passed your request to our Customer Care team. They will reply by email on Wednesday, October 21 at 9:00 am Pacific Time. \n\nFor damaged or leaking items reported within 7 days of delivery, please send a photo of the item and the packing slip so the team can help with a free replacement or full refund." }), false, 'routing'],
];

let bad = 0;
for (const [id, r, shouldPass, groups] of T) {
  const out = checkCase(cases[id], r);
  let good = out.passed === shouldPass;
  if (good && !shouldPass) {
    // Bad replies must fail in exactly the groups we expect.
    const failedGroups = Object.entries(out.groups).filter(([, v]) => !v).map(([k]) => k).sort().join(',');
    if (failedGroups !== groups.split(',').sort().join(',')) { good = false; out.failed_checks.push(`(expected failing groups ${groups}, got ${failedGroups})`); }
  }
  if (!good) bad++;
  console.log((good ? 'ok  ' : 'FAIL') + ` ${id} ${shouldPass ? 'good' : 'bad '} ` + (out.failed_checks.length ? '-> ' + out.failed_checks.join(' | ') : ''));
}
console.log(`\n${T.length - bad}/${T.length} test replies judged as intended`);
process.exit(bad ? 1 : 0);
