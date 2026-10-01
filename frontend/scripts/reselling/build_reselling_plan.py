#!/usr/bin/env python3
"""Build the FY 2026-27 reselling load plan (GA4 360, DV360, CM360) from
Zoho Books invoice lines (revenue) and Google India bills (OEM cost).
Reads local JSON only; writes _reselling_plan.json. No database access."""
import json, collections, re

FY_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
REV_ITEMS = {
    'Google Analytics 360': 'GA4 360',
    'Display and Video 360 Fee': 'DV360', 'Service Fees-DV360': 'DV360',
    'Campaign Manager 360 Fee': 'CM360', 'Service Fees-CM360': 'CM360',
}
# Google bills sometimes sit on a sister contact of the invoiced customer, or carry no customer at all.
COST_NAME_ALIAS = [  # (regex on bill line customer or description, invoiced customer name regex)
    (r'max ?life', r'AXIS MAX LIFE'),
    (r'oyo hotels|oravel', r'ORAVEL STAYS'),
    (r'home credit', r'HOME CREDIT'),
    (r'amar ujala', r'AMAR UJALA'),
]

lines = json.load(open('_invoice_lines_classified.json'))
inv = {i['number']: i for i in json.load(open('_zoho_invoices_fy2627.json'))}
bills = json.load(open('_zoho_google_bills_fy2627.json'))

def fix_month(l):
    m = l['service_month']
    if m.startswith('2025-') and re.search(r"'26|2026", l.get('desc') or ''):
        return '2026-' + m[5:], True
    return m, False

rev = collections.defaultdict(lambda: {'amount': 0.0, 'invoices': {}, 'fixed': False})
names, skipped_rev = {}, collections.defaultdict(float)
for l in lines:
    p = REV_ITEMS.get(l['item'])
    if not p: continue
    i = inv[l['invoice']]
    m, fixed = fix_month(l)
    if m not in FY_MONTHS:
        skipped_rev[(p, m)] += l['amount']; continue
    names[i['customer_id']] = i['customer']
    r = rev[(p, i['customer_id'], m)]
    r['amount'] += l['amount']; r['invoices'][l['invoice']] = l['date']; r['fixed'] |= fixed

def cost_product(l):
    d = l['description'] or ''
    if l['item'] == 'Google Analytics 360': return 'GA4 360'
    if l['item'] != 'Display and Video 360 Fee': return None
    if re.search(r'Search Ads 360', d, re.I): return 'SA360'
    if re.search(r'Fee:\s|AD SERVING|TRACKING AD', d, re.I): return 'CM360'
    return 'DV360'

by_name = lambda rx: [c for c, n in names.items() if re.search(rx, n, re.I)]
def resolve_customer(l):
    if l['customer_id'] in names: return l['customer_id'], None
    hay = (l['customer'] or '') + ' | ' + (l['description'] or '')
    for rx, target in COST_NAME_ALIAS:
        if re.search(rx, hay, re.I):
            hit = by_name(target)
            if len(hit) == 1: return hit[0], f"matched by name ({l['customer'] or 'no customer on bill'})"
    return l['customer_id'] or None, None

alloc = collections.defaultdict(lambda: {'amount': 0.0, 'note': None})  # (product, customer, month, bill) -> amount
bill_sub = {}
unalloc = []
for b in bills:
    month = [f['value'] for f in b['custom_fields'] if 'Month' in f['label']][0][:7]
    fx = b['exchange_rate'] or 1
    bill_sub[b['md_bill_id']] = (b['sub_total'] or 0) * fx
    for l in b['lines']:
        p = cost_product(l)
        if p is None: continue
        amt = (l['amount'] or 0) * fx
        cid, note = resolve_customer(l)
        key = (p, cid, month)
        if p == 'SA360' or key not in rev:
            why = 'SA360 not in scope' if p == 'SA360' else ('no customer on bill' if not cid else
                  'customer not invoiced for this product' if not any(k[0] == p and k[1] == cid for k in rev) else 'no invoice for this service month')
            unalloc.append({'product': p, 'month': month, 'bill': b['number'], 'customer': l['customer'] or (l['description'] or '')[:50], 'amount': round(amt, 2), 'reason': why})
            continue
        a = alloc[key + (b['md_bill_id'],)]
        a['amount'] += amt; a['note'] = note; a['bill_number'] = b['number']

plan = {'invoices': [], 'unallocated_cost': unalloc,
        'skipped_revenue_outside_fy': [{'product': p, 'service_month': m, 'amount': round(v, 2)} for (p, m), v in sorted(skipped_rev.items())]}
for (p, cid, m), r in sorted(rev.items()):
    als = [{'md_bill_id': k[3], 'bill_number': a['bill_number'], 'amount': round(a['amount'], 2),
            'pct': round(min(999.99, max(-999.99, 100 * a['amount'] / bill_sub[k[3]])), 2) if bill_sub[k[3]] else 0, 'note': a['note']}
           for k, a in alloc.items() if k[:3] == (p, cid, m) and round(a['amount'], 2) != 0]
    nums = sorted(r['invoices'])
    plan['invoices'].append({'product': p, 'zoho_customer_id': cid, 'customer': names[cid], 'period_month': m,
        'amount': round(r['amount'], 2), 'invoice_numbers': nums, 'invoice_date': max(r['invoices'].values()),
        'month_corrected': r['fixed'], 'allocations': als})
json.dump(plan, open('_reselling_plan.json', 'w'), indent=1)

for p in ['GA4 360', 'DV360', 'CM360']:
    rows = [i for i in plan['invoices'] if i['product'] == p]
    R = sum(i['amount'] for i in rows); C = sum(a['amount'] for i in rows for a in i['allocations'])
    U = sum(u['amount'] for u in unalloc if u['product'] == p)
    print(f"{p:8s} customers={len({i['zoho_customer_id'] for i in rows}):3d} rows={len(rows):3d} revenue={R/1e5:8.1f}L cost matched={C/1e5:8.1f}L cost unmatched={U/1e5:7.1f}L rows without cost={sum(1 for i in rows if not i['allocations'])}")
    bm = collections.defaultdict(lambda: [0, 0])
    for i in rows: bm[i['period_month']][0] += i['amount']; bm[i['period_month']][1] += sum(a['amount'] for a in i['allocations'])
    print('    month (rev L, cost L):', {k: (round(a/1e5), round(c/1e5)) for k, (a, c) in sorted(bm.items())})
ur = collections.defaultdict(float)
for u in unalloc: ur[(u['product'], u['reason'])] += u['amount']
print('unmatched cost by reason:', {k: round(v/1e5, 1) for k, v in ur.items()})
print('revenue outside FY by service month:', [(s['product'], s['service_month'], round(s['amount']/1e5, 1)) for s in plan['skipped_revenue_outside_fy']])
