// Define the structure for a sticky note
interface Snote {
  title: string;
  content: string | string[];
}

// Hardcoded notes object
export const notes: { [key: string]: Snote } = {
  vc: {
    title: "No one can hear me",
    content:
      "Disable **Advanced Voice Activity** in Voice settings of Discord, and reload the app.",
  },
  git: {
    title: "Links",
    content: [
      "ShiggyCord: https://github.com/kmmiio99o/ShiggyCord",
      "ShiggyManager: https://github.com/kmmiio99o/ShiggyManager",
      "ShiggyXposed: https://github.com/kmmiio99o/ShiggyXposed",
    ],
  },
  background: {
    title: "Background in themes not showing",
    content:
      "Due to a recent Discord change, the themes chat background is currently broken for some users. The devs want to fix it but haven't been able to recreate the problem themselves yet.",
  },
  ios: {
    title: "iOS Support",
    content:
      "Does ShiggyCord support iOS? No, but you can run it as a custom bundle by [KettuTweak](https://github.com/C0C0B01/KettuTweak).",
  },
  passkeys: {
    title: "Passkeys not working",
    content:
      "Due to the way ShiggyCord modifies the Discord app, it breaks the functionality of passkeys. To use passkeys, you must instead use ShiggyXposed, which doesn't alter the original app. Please note that ShiggyXposed requires a rooted device.",
  },
  ftf: {
    title: "Failed to fetch",
    content:
      "ShiggyCord tried to fetch bundle but couldn't. Try using vpn and see if it works. But if Shiggy still load successfully, ignore it.",
  },
  // Add more notes here as needed
};
