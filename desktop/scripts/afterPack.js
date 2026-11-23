/* Puts the app icon and version details into the Windows .exe without needing Wine on the build machine. */
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const info = ctx.packager.appInfo;
  const exe = path.join(ctx.appOutDir, info.productFilename + '.exe');
  const exeObj = ResEdit.NtExecutable.from(fs.readFileSync(exe));
  const resObj = ResEdit.NtExecutableResource.from(exeObj);

  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resObj.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resObj.entries, groupId, lang, ico.icons.map((i) => i.data));

  const vi = ResEdit.Resource.VersionInfo.fromEntries(resObj.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
  const [a, b, c] = info.version.split('.').map((n) => parseInt(n, 10) || 0);
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: info.productName,
    ProductName: info.productName,
    CompanyName: info.companyName || '',
    LegalCopyright: '',
    OriginalFilename: info.productFilename + '.exe',
    InternalName: info.productFilename
  });
  vi.outputToResourceEntries(resObj.entries);
  resObj.outputResource(exeObj);
  fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
  console.log('  • afterPack: icon and version info written to', path.basename(exe));
};
