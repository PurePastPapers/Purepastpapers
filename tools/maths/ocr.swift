// Read-only native OCR for public source PDFs that lack a text layer.
// swift tools/maths/ocr.swift SOURCE.pdf OUTPUT_DIRECTORY [START_PAGE [END_PAGE]]
// Output coordinates use PDF points from the top-left, compatible with pdfplumber.
import Foundation
import PDFKit
import Vision
import AppKit
import ImageIO

struct OCRWord: Codable {
    let text: String
    let x0: Double
    let x1: Double
    let top: Double
    let bottom: Double
    let fontname: String
    let upright: Bool
    let confidence: Float
}
struct OCRPage: Codable {
    let page: Int
    let width: Double
    let height: Double
    let source_file: String
    let engine: String
    let words: [OCRWord]
}
enum Failure: Error { case invalidArguments, unreadablePDF, renderFailed }
func run() throws {
    let args = CommandLine.arguments
    guard args.count >= 3 else { throw Failure.invalidArguments }
    let source = URL(fileURLWithPath: args[1]).standardizedFileURL
    let destination = URL(fileURLWithPath: args[2]).standardizedFileURL
    guard let document = PDFDocument(url: source) else { throw Failure.unreadablePDF }
    try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
    let start = max(1, args.count > 3 ? Int(args[3]) ?? 1 : 1)
    let end = min(document.pageCount, args.count > 4 ? Int(args[4]) ?? document.pageCount : document.pageCount)
    guard start <= end else { throw Failure.invalidArguments }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    for pageNumber in start...end {
        let output = destination.appendingPathComponent(String(format: "page-%03d.json", pageNumber))
        if FileManager.default.fileExists(atPath: output.path) {
            print("Page \(pageNumber): already cached")
            continue
        }
        try autoreleasepool {
            guard let page = document.page(at: pageNumber - 1) else { throw Failure.renderFailed }
            let bounds = page.bounds(for: .mediaBox)
            let scale: CGFloat = 2
            let width = Int(ceil(bounds.width * scale)), height = Int(ceil(bounds.height * scale))
            guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw Failure.renderFailed }
            context.setFillColor(NSColor.white.cgColor)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.scaleBy(x: scale, y: scale)
            context.translateBy(x: -bounds.minX, y: -bounds.minY)
            page.draw(with: .mediaBox, to: context)
            guard let image = context.makeImage() else { throw Failure.renderFailed }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-GB"]
            request.usesLanguageCorrection = false // Preserve source equations and labels.
            request.minimumTextHeight = 0.003
            let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
            try handler.perform([request])
            var words: [OCRWord] = []
            for observation in request.results ?? [] {
                guard let recognized = observation.topCandidates(1).first else { continue }
                let text = recognized.string
                let tokenPattern = try NSRegularExpression(pattern: "\\S+")
                for match in tokenPattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                    guard let range = Range(match.range, in: text),
                        let tokenBox = try? recognized.boundingBox(for: range) else { continue }
                    let box = tokenBox.boundingBox
                    words.append(OCRWord(text: String(text[range]),
                        x0: Double(box.minX * bounds.width), x1: Double(box.maxX * bounds.width),
                        top: Double((1 - box.maxY) * bounds.height),
                        bottom: Double((1 - box.minY) * bounds.height),
                        fontname: "OCR", upright: true, confidence: recognized.confidence))
                }
            }
            words.sort { $0.top == $1.top ? $0.x0 < $1.x0 : $0.top < $1.top }
            let record = OCRPage(page: pageNumber, width: Double(bounds.width), height: Double(bounds.height),
                source_file: source.path, engine: "Apple Vision VNRecognizeTextRequest accurate en-GB; OCR text requires review against source crop", words: words)
            try encoder.encode(record).write(to: output, options: .atomic)
            print("Page \(pageNumber): \(words.count) words")
        }
    }
}
do { try run() } catch {
    fputs("OCR failed: \(error)\nUsage: swift ocr.swift SOURCE.pdf OUTPUT_DIRECTORY [START_PAGE [END_PAGE]]\n", stderr)
    exit(1)
}
