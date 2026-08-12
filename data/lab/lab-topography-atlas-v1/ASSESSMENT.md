# Lab topography atlas v1

This package turns the all-labs catalog into a deterministic, inspectable terrain model. It includes **53 labs**, **33,102,112 recorded runs**, and 18 labs whose run volume is explicitly unknown rather than treated as zero.

## Reading the terrain

- X groups research families in an explicit historical order.
- Y is stable natural-sort campaign order within each family.
- The default elevation is logarithmic recorded run volume.
- The interactive viewer can instead render evidence depth or artifact completeness.
- Geographic distance is not a learned similarity or causal-distance claim.

## Reproduce

Run `npm run build:lab-topography`. The interactive view is `?view=atlas` in the web app. The AM4 handoff is [render-job.json](render-job.json); its precondition protects any workload already owning the B70 render devices. Trial renders use AM4's local Linux volume because `/mnt/win` is currently mounted read-only.

Atlas hash: `sha256:fe618ba2d61e12a8c6e3cc703e8124265526b00c4dd9202f03ad27618fda37e6`
