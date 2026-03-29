// src/explore/urfeed/feed/composer/Composer.jsx
import TextComposer from "./TextComposer";
import ImageComposer from "./ImageComposer";
import VoiceComposer from "./VoiceComposer";

/*
  Composer.jsx
  ------------
  Handles creation of posts:
  - Text
  - Image
  - Voice
*/

export default function Composer() {
  return (
    <div>
      <TextComposer />
      <ImageComposer />
      <VoiceComposer />
    </div>
  );
}
