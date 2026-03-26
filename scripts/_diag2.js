const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();
const RID = "g4Zbr8tEguMcpZonw72xM5MGse32";

(async () => {
  try {
    const rd = await db.collection("users").doc(RID).get();
    const rv = rd.data();
    console.log("=== REVIEWER ===");
    console.log("Name:", rv.name, "| male:", rv.male, "| orientation:", rv.orientation);
    console.log("userType:", rv.userType, "| lat:", rv.latitude, "| lon:", rv.longitude);
    console.log("g (geohash):", rv.g);
    console.log("accountStatus:", rv.accountStatus, "| paused:", rv.paused);
    console.log("liked:", (rv.liked || []).length, "| passed:", (rv.passed || []).length);

    const testSnap = await db.collection("users").where("isReviewer", "==", true).get();
    console.log("\n=== TEST PROFILES (field check) ===");
    let issues = 0;
    testSnap.forEach(doc => {
      if (doc.id === RID) return;
      const d = doc.data();
      const problems = [];
      if (d.accountStatus !== "active") problems.push("accountStatus=" + d.accountStatus);
      if (d.paused === true) problems.push("paused=true");
      if (d.visibilityReduced === true) problems.push("visibilityReduced=true");
      if (!d.g) problems.push("NO geohash");
      if (d.latitude == null) problems.push("NO lat");
      if (d.longitude == null) problems.push("NO lon");
      if (problems.length > 0) {
        issues++;
        console.log("  ISSUE:", doc.id.substring(0,12)+"...", d.name, "|", problems.join(", "));
      }
    });
    if (issues === 0) console.log("  All profiles OK");
    else console.log("  Issues found:", issues);

    // Stories check
    const storySnap = await db.collection("stories")
      .where("isPersonal", "==", true)
      .where("isReviewer", "==", true)
      .get();
    console.log("\n=== STORIES ===");
    console.log("Total:", storySnap.size);
    if (storySnap.docs[0]) {
      const s = storySnap.docs[0].data();
      console.log("Sample fields:", Object.keys(s).join(", "));
      console.log("  senderId:", s.senderId ? s.senderId.substring(0,12)+"..." : "MISSING");
      console.log("  imageUrl:", s.imageUrl ? s.imageUrl.substring(0,60)+"..." : "MISSING");
      console.log("  expiresAt:", s.expiresAt);
      console.log("  neverExpires:", s.neverExpires);
    }

    // Simulate discovery result count
    const storyMap = {};
    storySnap.forEach(s => {
      const sid = s.data().senderId;
      storyMap[sid] = (storyMap[sid]||0) + 1;
    });

    let discoveryCount = 0;
    let discoveryWithStories = 0;
    testSnap.forEach(doc => {
      if (doc.id === RID) return;
      const d = doc.data();
      if (d.accountStatus !== "active") return;
      if (d.paused === true) return;
      if (d.visibilityReduced === true) return;
      discoveryCount++;
      if (storyMap[doc.id]) discoveryWithStories++;
    });
    console.log("\n=== SIMULATED DISCOVERY ===");
    console.log("Would appear in discovery:", discoveryCount);
    console.log("Of those, with stories:", discoveryWithStories);
    
    process.exit(0);
  } catch(e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
