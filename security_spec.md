# RetailLink Analytics — Security Specification

## 1. Data Invariants
1. **Store Ownership Boundary**: A `StoreProfile` document at `/stores/{storeId}` may only be read, created, or updated by a verified authenticated user whose `request.auth.uid == storeId` and `ownerId == request.auth.uid`.
2. **Subcollection Master Gate**: Every subcollection document (`items`, `dailyLogs`, `distributors`, `orders`) under `/stores/{storeId}` cannot exist without a valid parent `/stores/{storeId}` whose `ownerId == request.auth.uid`, and must match `storeId` and `ownerId == request.auth.uid`.
3. **Immutable Ownership & Timestamps**: `ownerId`, `storeId`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. **Terminal Order Locking**: Once a `RestockOrder` reaches `status == 'delivered'`, it is locked against further updates. Status transitions can only move forward (`draft` -> `sent` -> `delivered`).
5. **Bounded Arrays & Strings**: `itemIds` on `RestockOrder` is bounded to 1–50 string elements; all strings enforce strict `minLength` / `maxLength` bounds.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read**: Read `/stores/userA` with `auth: null`.
2. **Unverified Email Write**: Create `/stores/userA` with `email_verified: false`.
3. **Cross-Tenant Store Hijack**: User B creates `/stores/userA` or reads `/stores/userA/items/item1`.
4. **Identity Spoofing on Create**: User A creates `/stores/userA/items/item1` with `ownerId: "userB"`.
5. **Shadow / Ghost Field Injection**: User A creates `/stores/userA` with an extra field `isAdmin: true`.
6. **ID Poisoning**: User A creates `/stores/userA/items/${'a'.repeat(200)}` or `invalid/id`.
7. **Timestamp Forgery**: User A creates `/stores/userA/dailyLogs/log1` with a backdated client timestamp instead of `request.time`.
8. **Type Poisoning on Update**: User A updates `/stores/userA/items/item1` setting `currentStock: "not-a-number"` or `name: "x".repeat(500)`.
9. **Immutable Field Mutation**: User A updates `/stores/userA/items/item1` attempting to mutate `ownerId` or `createdAt`.
10. **Terminal State Bypass**: User A updates a `RestockOrder` whose existing `status == 'delivered'` back to `'sent'`.
11. **Unbounded Array / Invalid Element**: User A creates a `RestockOrder` with `itemIds: []` or `itemIds` of 51 items or `[123]`.
12. **Blanket Collection Scraping**: User B runs a `list` query on `/stores/userA/items` without matching `ownerId == userB`.
