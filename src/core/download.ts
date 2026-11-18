/** 浏览器端文件下载（导出聊天/角色卡用）。无 document 环境（测试）下静默跳过。 */
export function downloadTextFile(filename: string, text: string, mime = "text/plain;charset=utf-8"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
