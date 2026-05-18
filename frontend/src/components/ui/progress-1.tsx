import * as React from "react"
import { Progress as ArkProgress } from "@ark-ui/react-progress"
import { cn } from "@/lib/utils"

const Progress = ArkProgress.Root
const ProgressTrack = ArkProgress.Track
const ProgressRange = ArkProgress.Range

const ProgressLabel = ArkProgress.Label
const ProgressValueText = ArkProgress.ValueText

export { Progress, ProgressTrack, ProgressRange, ProgressLabel, ProgressValueText }