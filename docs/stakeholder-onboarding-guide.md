# Golden Abode: Stakeholder Next Steps

This document explains the core concepts we discussed in the meeting in plain English. It also outlines the exact information needed to move forward.

---

## 1. How the App Works (The Big Picture)

Instead of a complex recommendation system, we are focusing on **Order Validation** and **Project Management**. Here is how the main pieces connect:

1.  **The Project (The Hub)**: Think of a "Project" as a single house or construction site. Everything revolves around this.
2.  **The Customer**: The person who owns the project and pays for materials.
3.  **The Vendor**: The business supplying the materials to the project.
4.  **The Artisan**: The worker at the project site. Their main job in the app is to **validate orders** (check a box saying "Yes, this is the correct material and good quality") so the customer doesn't waste money.
5.  **Admin Approval**: To ensure high quality, anyone who signs up as an Artisan or Vendor cannot use the app immediately. An Admin must review their profile and approve them.

### The Artisan "Team" Concept
In the real world, artisans usually work in squads under one lead contractor.
*   **Question to decide**: Should the lead contractor just type "I have a team of 5 people" on their profile, OR do you want the app to actually let the lead contractor invite their 5 team members to download the app and join their specific "Digital Team"? (The first option is much faster to build for the MVP).

---

## 2. Onboarding Forms: What Information Do We Ask For?

When an Artisan or Vendor signs up, we need them to fill out a profile so the Admin can decide whether to approve them.

> [!NOTE]
> **These are ONLY suggestions!** 
> I have listed some possible fields below just to give you ideas and a starting point. Nothing is finalized yet. Please look over these suggestions and decide which ones to KEEP, which ones to REMOVE entirely, and what new fields to ADD based on business needs.

### Suggested Fields for an "Artisan Profile"
*   **Full Name**: (e.g., Rajesh Kumar)
*   **Phone Number**: (Used for login)
*   **Primary Skill**: (e.g., Plumber, Electrician, Carpenter)
*   **Years of Experience**: (e.g., 5 years)
*   **Team Size**: (Does he work alone or have a team?)
*   **Photo of ID / Aadhar**: (For background verification)
*   **Photos of Past Work**: (To prove quality)
*   **Service Area / City**: (Where do they work?)

### Suggested Fields for a "Vendor Profile"
*   **Business Name**: (e.g., Sharma Hardware)
*   **Owner Name**: (e.g., Anil Sharma)
*   **Phone Number**: (Used for login)
*   **Business Address / Location**: (Where is the shop?)
*   **GST Number**: (For verification)
*   **Types of Materials Sold**: (e.g., Plumbing, Electrical, Cement)
*   **Delivery Offered?**: (Yes/No)

---

## 3. Setting Up MSG91 & DLT Registration (For OTP Logins)

We are using **MSG91** to send the 6-digit OTP codes to users when they log in. Since this involves SMS charges and Indian Telecom regulations, the business owner must set this up.

**What is MSG91?**
It's an SMS delivery service. When a user types their phone number in our app, our server secretly talks to MSG91 and says "Send the number 123456 to Rajesh". We don't store passwords, making the app much more secure.

**What is DLT?**
Due to TRAI regulations in India, you cannot send SMS without registering your business, Sender Name, and Message Templates on a Distributed Ledger Technology (DLT) portal with a telecom operator. MSG91 will block any messages that are not DLT approved.

### Step-by-Step Setup Guide

#### Phase 1: DLT Business Registration
1. Go to a telecom DLT Portal (e.g., [Jio DLT](https://trueconnect.jio.com/) or [PingConnect](https://pingconnect.in/)).
2. Sign up as a **Principal Entity**.
3. Upload your business documents (GST Certificate, Business PAN, etc.).
4. Pay the registration fee (usually around ₹5,900 INR).
5. Once approved (2-3 days), you will receive a unique **Entity ID**.

#### Phase 2: Sender ID & Template Registration
1. In the DLT portal, go to the **Headers** section and request a 6-letter Sender ID (e.g., `GOLDEN`). This must logically match your business name.
2. Go to the **Content Templates** section.
3. Select "Authentication/OTP" category.
4. Create the template using variables for the OTP number: `Your Golden Abode login OTP is {#var#}. Do not share this with anyone. - Golden Abode`
5. Once approved (1-2 days), the portal will generate a **Template ID**.

#### Phase 3: MSG91 Setup
1. Go to **[MSG91.com](https://msg91.com/)** and create your account.
2. Enter your **Entity ID** from Phase 1 into your MSG91 profile.
3. Go to the **API Keys / Auth** section in the MSG91 dashboard and generate a new Auth Key.

### What to Send to the Developer
Once you finish the setup, please securely send the following 3 pieces of information to the development team:

1.  **MSG91 Auth Key**: (A long string of random letters and numbers)
2.  **Sender ID**: (The 6-letter name, e.g., `GOLDEN`)
3.  **Template ID**: (The ID of the approved SMS message template)

Once the team has these, they will plug them into the code, and real OTPs will start working immediately!
