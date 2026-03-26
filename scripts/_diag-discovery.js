const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();
const RID = "g4Zbr8tEguMcpZonw72xM5MGse32";

(async () => {
  try {
    const rd = await db.collection("users").doc(RID).get();
    const d = rd.data();
    const liked = d.liked || [];
    const passed = d.passed || [];
    console.log("Reviewer liked:", liked.length, "passed:", passed.length);

    const testSnap = await db.collection("users").where("isReviewer", "==", true).get();
    const testProfiles = [];
    testSnap.forEach(doc => {
      if (doc.id !== RID) testProfiles.push({ id: doc.id, name: doc.data().name });
    });
    console.log("Test profiles (excl reviewer):", testProfiles.length);

    const excludeSet = new Set([...liked, ...passed]);
    const available = testProfiles.filter(p => !excludeSet.has(p.id));
    console.log("Available (not liked/passed):", available.length);

    const storySnap = await db.collection("stories")
      .where("isPersonal", "==", true)
      .where("isReviewer", "==", true)
      .get();
    const storyMap = {};
    storySnap.forEach(s => {
      const sid = s.data().senderId;
      storyMap[sid] = (storyMap[sid] || 0) + 1;
    });
    console.log("Total reviewer stories:", storySnap.size);
    console.log("Unique profiles with stories:", Object.keys(storyMap).length);

    console.log("\n--- Available (not swiped) WITH stories ---");
    let countAvailWithStories = 0;
    available.forEach(p => {
      if (storyMap[p.id]) {
        countAvailWithStories++;
        console.log("  ", p.id.substring(0, 12) + "...", p.name, "->", storyMap[p.id], "stories");
      }
    });
    console.log("Count:", countAvailWithStories);

    console.log("\n--- Already liked/passed WITH stories ---");
    let countSwipedWithStories = 0;
    const swiped = testProfiles.filter(p => excludeSet.has(p.id));
    swiped.forEach(p => {
      if (storyMap[p.id]) {
        countSwipedWithStories++;
        console.log("  ", p.id.substring(0, 12) + "...", p.name, "->", storyMap[p.id], "stories");
      }
    });
    console.log("Count:", countSwipedWithStories);

    console.log("\n--- Available (not swiped) WITHOUT stories ---");
    const availNoStories = available.filter(p => !storyMap[p.id]);
    availNoStories.slice(0, 5).forEach(p => {
      console.log("  ", p.id.substring(0, 12) + "...", p.name);
    });
    console.log("Count:", availNoStories.length);

    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
