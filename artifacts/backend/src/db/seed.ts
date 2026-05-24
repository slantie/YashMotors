import "dotenv/config";
import { db } from "./client.js";
import { departments, users } from "./schema.js";
import { hashPin } from "../lib/auth.js";

// Default PIN for all seeded users: 1234
const defaultPin = await hashPin("1234");

async function seed() {
  console.log("Seeding departments...");
  const [deptPainting, deptDenting, deptElectrical, deptPolishing, deptWashing] =
    await db
      .insert(departments)
      .values([
        { name: "Painting" },
        { name: "Denting" },
        { name: "Electrical" },
        { name: "Polishing" },
        { name: "Washing" },
      ])
      .onConflictDoNothing()
      .returning();

  console.log("Seeding users...");
  await db
    .insert(users)
    .values([
      // SuperAdmins
      { name: "Rajpal Patel",     phone: "9825032098", role: "superadmin", pinHash: defaultPin },
      { name: "Nandish Patel",    phone: "9909260701", role: "superadmin", pinHash: defaultPin },
      { name: "Dipak Gajjar",     phone: "9879204701", role: "superadmin", pinHash: defaultPin },
      // Admins
      { name: "Chetan Mistry",    phone: "9825219701", role: "admin",      pinHash: defaultPin },
      { name: "Dhruvin Suthar",   phone: "9624771597", role: "admin",      pinHash: defaultPin },
      { name: "Himali Panchasara",phone: "9978993701", role: "admin",      pinHash: defaultPin },
      { name: "Hiren Vyas",       phone: "9879503926", role: "admin",      pinHash: defaultPin },
      // Advisors
      { name: "Mitesh Patel",     phone: "9727707701", role: "advisor",    pinHash: defaultPin },
      { name: "Musahid Ali",      phone: "9712995701", role: "advisor",    pinHash: defaultPin },
      { name: "Heril Christian",  phone: "7048103330", role: "advisor",    pinHash: defaultPin },
      { name: "Aakash Christian", phone: "9909914701", role: "advisor",    pinHash: defaultPin },
      { name: "Anand Thakkar",    phone: "9879531701", role: "advisor",    pinHash: defaultPin },
      { name: "Raju Singal",      phone: "9978996701", role: "advisor",    pinHash: defaultPin },
      { name: "Renison",          phone: "9099989701", role: "advisor",    pinHash: defaultPin },
      { name: "Harshil",          phone: "9712938701", role: "advisor",    pinHash: defaultPin },
      { name: "Jaydeep",          phone: "8460050593", role: "advisor",    pinHash: defaultPin },
      // Technicians
      { name: "Slantie",          phone: "9824153257", role: "technician", pinHash: defaultPin },
    ])
    .onConflictDoNothing();

  console.log("✓ Seeded 5 departments, 17 users (default PIN: 1234)");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
