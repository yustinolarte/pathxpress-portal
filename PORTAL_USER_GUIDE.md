# PATHXPRESS Portal - User Management Guide

## Adding New Portal Users

Portal users (admin and customer) require properly hashed passwords. **DO NOT** insert users directly into the database, as manual password entries will not work.

### Using the add-portal-user Script

We provide a script that handles password hashing automatically:

```bash
node add-portal-user.mjs
```

The script will prompt you for:
1. **Email**: User's email address (must be unique)
2. **Password**: Plain text password (will be hashed automatically)
3. **Role**: Either `admin` or `customer`
4. **Client ID** (only for customer role): The ID from the `clientAccounts` table

### Example: Adding an Admin User

```bash
$ node add-portal-user.mjs

=== PATHXPRESS Portal User Creation ===

Email: admin@pathxpress.ae
Password: SecurePassword123
Role (admin/customer): admin

Hashing password...
Connecting to database...
Creating user...

✅ User created successfully!
   ID: 3
   Email: admin@pathxpress.ae
   Role: admin

You can now login at: /portal/login
```

### Example: Adding a Customer User

```bash
$ node add-portal-user.mjs

=== PATHXPRESS Portal User Creation ===

Email: customer@newcompany.com
Password: CustomerPass456
Role (admin/customer): customer
Client ID (from clientAccounts table): 2

Hashing password...
Connecting to database...
Creating user...

✅ User created successfully!
   ID: 4
   Email: customer@newcompany.com
   Role: customer
   Client ID: 2

You can now login at: /portal/login
```

## Creating Client Accounts First

Before adding a customer user, you need to create a client account in the admin portal:

1. Login as admin at `/portal/login`
2. Go to the "Clients" tab
3. Click "Add New Client"
4. Fill in the company information
5. Note the Client ID that gets created
6. Use that Client ID when running the add-portal-user script

## Default Test Users

The seed data includes these test users:

**Admin User:**
- Email: `admin@pathxpress.ae`
- Password: `admin123`
- Role: admin

**Customer User:**
- Email: `customer@techsolutions.ae`
- Password: `customer123`
- Role: customer
- Client ID: 1 (Tech Solutions DMCC)

## Troubleshooting

### "Invalid email or password" error

This usually means:
1. The user was inserted directly into the database without proper password hashing
2. The password is incorrect

**Solution**: Delete the user from the database and recreate using the script:

```sql
DELETE FROM portalUsers WHERE email = 'problematic@email.com';
```

Then run `node add-portal-user.mjs` to create the user properly.

### "User already exists" error

The email is already in the database. Either:
1. Use a different email
2. Delete the existing user first (see above)

### "Client ID must be a number" error

Make sure you're entering a valid numeric Client ID from the `clientAccounts` table.

## Security Notes

- Passwords are hashed using bcrypt with 10 salt rounds
- Never store plain text passwords in the database
- Always use the provided script for user creation
- Admin users don't need a Client ID
- Customer users MUST have a valid Client ID

## Database Schema

The `portalUsers` table structure:

```sql
CREATE TABLE portalUsers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'customer') NOT NULL,
  clientId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

Portal authentication uses JWT tokens:

- `POST /api/trpc/portal.auth.login` - Login with email/password
- `POST /api/trpc/portal.auth.logout` - Logout (clears token)
- Token is stored in localStorage on the client side
- Token expires after 7 days of inactivity
