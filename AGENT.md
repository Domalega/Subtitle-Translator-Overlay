# Protected UI

Settings and Dictionary are protected UI surfaces. OCR, screen-capture, detector, and translation tasks must not modify their HTML, JavaScript, or shared tool-window stylesheet.

Update `test/contracts/protected-ui-files.json` only for a direct Settings or Dictionary UI task after intentional review. Never update hashes solely to make a check pass.
