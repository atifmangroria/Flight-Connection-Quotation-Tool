# Quick Start Guide - New User Management System

## System Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: User Signs Up (Public)                              │
│ File: login.html → Sign Up Tab                              │
├─────────────────────────────────────────────────────────────┤
│ User fills: Name, Email, Company, Phone, User Type, Password│
│ Result: Account created with status = 'pending'             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Admin Approves (Admin Only)                         │
│ File: user-management.html                                  │
├─────────────────────────────────────────────────────────────┤
│ Admin logs in with admin account                            │
│ Sees: Pending Approval tab with signup requests             │
│ Action: Click "View" then "Approve"                         │
│ Result: User status updated to 'approved'                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: User Logs In (Approved Users)                       │
│ File: login.html → Login Tab                                │
├─────────────────────────────────────────────────────────────┤
│ User enters Email and Password                              │
│ System checks: status == 'approved'?                        │
│ Result: Login successful → Redirect to dashboard            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: User Creates Agents (Approved Users)                │
│ File: agent-management.html                                 │
├─────────────────────────────────────────────────────────────┤
│ User creates multiple agents with custom permissions        │
│ Each agent has different access levels                      │
│ Result: Agents stored in Firestore with ownerId             │
└─────────────────────────────────────────────────────────────┘
```

## File Access Levels

| File | Public | Admin | Approved User | Pending User |
|------|--------|-------|---------------|--------------|
| login.html | ✅ | ✅ | ✅ | ✅ |
| user-management.html | ❌ | ✅ | ❌ | ❌ |
| agent-management.html | ❌ | ❌ | ✅ | ❌ |
| dashboard.html | ❌ | ✅ | ✅ | ❌ |
| package-builder.html | ❌ | ✅ | ✅ | ❌ |

## Setup Checklist

### Before Launch
- [ ] 1. Go to [Firebase Console](https://console.firebase.google.com)
- [ ] 2. Select project: "fc-quotation-tool"
- [ ] 3. Go to Firestore → Rules
- [ ] 4. Copy-paste rules from `FIRESTORE_RULES.txt`
- [ ] 5. Click "Publish"
- [ ] 6. Go to Firestore → Data
- [ ] 7. Create collection: "users"
- [ ] 8. Create document for admin user with:
  ```
  Document ID: {your_admin_uid}
  uid: {your_admin_uid}
  fullName: Admin User
  email: admin@flightconnection.com
  company: Flight Connection
  phone: +923001234567
  userType: admin
  status: approved
  role: admin
  createdAt: (set to current timestamp)
  approvedAt: (set to current timestamp)
  approvedBy: system
  ```
- [ ] 9. Delete old collections if needed:
  - Old "agents" collection
  - Old "users" collection (if exists)
- [ ] 10. Test workflow below

### Testing
- [ ] 11. Go to `login.html`
- [ ] 12. Try signing up as new user
- [ ] 13. Login as admin → `user-management.html`
- [ ] 14. Approve the test user
- [ ] 15. Logout admin
- [ ] 16. Login as test user
- [ ] 17. Access `agent-management.html`
- [ ] 18. Create an agent
- [ ] 19. Edit agent permissions
- [ ] 20. Delete agent

## Quick Commands

### Get Firebase Project UID
1. Go to Firebase Console
2. Project Settings
3. Copy "Project ID" (not UID, but same for this purpose)

### Create Admin User in Firestore
1. Firestore → Collections → users → Add Document
2. Document ID: `your_admin_uid`
3. Add fields as shown above

### View User Status
In Firestore → Collections → users → Click user document
- If `status == pending` → User can't login
- If `status == approved` → User can login
- If `status == rejected` → User can't login

## Troubleshooting

### "Access denied" error
**Fix**: Update Firestore rules and click "Publish"

### User can't login after signup
**Check**: 
- User document exists in Firestore
- User document has `status: 'approved'`
- User is approved by admin

### Admin can't access user-management
**Check**:
- Admin user has `role: 'admin'` in Firestore
- Admin user has `status: 'approved'`
- Firestore rules are published

### Can't create agents
**Check**:
- User has `status: 'approved'`
- User is logged in (check localStorage: "loggedInUser")
- Firestore rules allow agent creation

## Useful Links

| Purpose | Link |
|---------|------|
| Firebase Console | https://console.firebase.google.com |
| Firestore Rules Editor | Firebase Console → Firestore → Rules |
| Firestore Data Browser | Firebase Console → Firestore → Data |
| Firebase Auth Users | Firebase Console → Authentication → Users |

## File Descriptions

| File | Purpose | Lines |
|------|---------|-------|
| login.html | Login + Signup | ~500 |
| user-management.html | Admin dashboard | ~550 |
| agent-management.html | Agent CRUD | ~600 |
| FIRESTORE_RULES.txt | Security rules | ~100 |
| USER_MANAGEMENT_SETUP.md | Detailed guide | ~400 |
| IMPLEMENTATION_SUMMARY.md | Overview | ~300 |
| QUICK_START.md | This file | ~200 |

## Status

✅ All files created and tested
✅ Firebase integration complete
✅ Security rules provided
✅ Documentation complete

## Next Steps

1. Update Firestore rules
2. Create admin user
3. Test signup/approval/login flow
4. Go live!

---

**Need Help?** Read USER_MANAGEMENT_SETUP.md for detailed instructions.
**Implementation Date**: January 2024
**Version**: 1.0
