window.overlayApi.onDeveloperSubtitleCandidateState((state) => {
  document.getElementById('candidate').hidden = state?.visible !== true;
});
