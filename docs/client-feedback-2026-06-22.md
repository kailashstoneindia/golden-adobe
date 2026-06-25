# Client Feedback & Requirements
**Date received:** June 22, 2026

## Raw Feedback from Umesh

> **[12:15, 22/06/2026] +1 (219) 276-3808:** Hello Harshit, Tarun
> 
> For Governance & Status, lets also add.
> 
> is_approved (Boolean): Defaults to false. This controls the Admin Approval step; until you toggle this to true, they are blocked from listing inventory or taking projects.
> 
> is_active (Boolean): Allows us to temporarily pause a vendor/contractor (e.g., if they close their shop for holidays) without completely deleting their account and breaking historical order data. Or Contractor calling off or something
> 
> **[12:18, 22/06/2026] +1 (219) 276-3808:** I took a deep dive brainstorming about delivery today and here is my thought below. I dont want Day-1 problems in this, a bad delivery protocol can cause disastrous situations for the business. A bad review will backfire on us.
> 
> We cannot treat delivery as a simple Yes/No checkbox on the vendor profile. To prevent delivery fraud (e.g., clients claiming items are missing or swapping branded goods for local ones), we must introduce a secure drop-off protocol.
> 
> For the MVP, we don't need real-time map tracking, but the architecture must support the following: When a vendor fulfills an order, a secure 6-digit Delivery OTP must be generated for the Customer. The delivery driver must input this OTP at the site to unlock and close the sub-order. The driver must have a way (via a simplified app view or web link) to upload an "Open-Box Delivery" confirmation photo of the materials at the site before the transaction is marked complete.
> 
> **[12:19, 22/06/2026] +1 (219) 276-3808:** Answers to Your Product Questions
> - Artisan Team Concept: Let's go with Option 1 (the lead contractor simply types their team size on their profile). This keeps the MVP lean. However, please ensure that only the primary verified Artisan account has the authorization to validate orders.
> - Onboarding Forms Profile Updates: For Vendors: Please add fields for Bank Account Details/UPI ID (for manual payout processing) and ensure the shop location captures GPS Coordinates (Latitude/Longitude) alongside the physical text address. For Artisans: Please add a UPI ID/Bank Details field for their rewards wallet redemptions

---

## Technical Action Items (For Phase 2)

Based on this feedback, the following architectural updates are required:

1. **User Model Updates:**
   - Add `is_approved` (Boolean, default `false`) for Admin gatekeeping.
   - (Note: `is_active` is already implemented).
   - Add `upi_id` / `bank_details` for payouts/rewards.
   - Add `team_size` (Integer) specifically for Artisan roles.
   - Add `latitude` and `longitude` specifically for Vendor roles.

2. **Delivery & Order Architecture:**
   - **Delivery OTP System**: Order fulfillment must generate a 6-digit OTP for the customer.
   - **Open-Box Verification**: The completion of a delivery requires the driver to input the OTP *and* upload a proof-of-delivery photograph to our storage buckets (e.g., AWS S3).
   - **Permissions**: Ensure strict Role-Based Access Control (RBAC) so that *only* the primary Artisan account can trigger order validations.
