Web App Template (WAT) for Universal Windows Platform (UWP)
=========================

Web App Template (WAT) is Visual Studio 2015 project that lets developers create Universal Windows Platform (UWP) apps based on existing web content. 

Used in the right way, WAT can facilitate the creation of compelling extensions to your web content for Windows users.

## What's new

### Cortana

Template automatically pulls in all items from all navbar, appbar, settings and search items. You can toggle this feature for any or all in the configuration file.

 - For items in navbar, appbar and settings; you can use "AppName Go [to] ItemName" to navigate 
 - For search; you can use "AppName Search [for] SearchTerm" to search
 
<img src="http://i.imgur.com/mQzEvcM.gif" width="500" />

### In-app Voice Commands

Similar to Cortana, but only pulls in all navbar commands, and search. You can toggle this feature in the configuration file.

 - Search will popup a new dialog box that accepts user voice input for any search terms.
 
<img src="http://i.imgur.com/66al2IB.gif" width="500" />

### Splitview

Template uses the "wat_navbar"  property in the configuration file to populate this list.

<img src="http://i.imgur.com/1Zav2Nu.gif" width="500" />

### AutoSuggest Box
Template uses the "wat_search" property in the configuration file to direct search terms.

<img src="http://i.imgur.com/2ApsR1Z.gif" width="500" />

### Inking
Enables user to ink and share inking to any share target app.
You can toggle this feature via the "wat_ink" toggle in the configuration file.
If you don't have header enabled, you can not use the inking since there won't be a button to toggle it.

<img src="http://i.imgur.com/lG43RIA.gif" width="500" />

### Jumplist
Template automatically pulls in all navbar items to the app jumplist for quick navigation.

(This feature is only available on Windows 10 Version 1511 or later)

<img src="http://i.imgur.com/mQzEvcM.gif" width="500" />

### Toolbar
Appbar items are moved to a WinJS.UI.Toolbar at the bottom.
Settings items are moved to a WinJS.UI.Toolbar at the top as a secondary section item.

### Removed deprecated APIs
All deprecated APIs, such as SearchPane, SearchBox and more are replaced and/or removed.

### WinJS 4.4
Updated with WinJS v4.4

## Getting Started
You need Visual Studio 2015 Update 1 or later

 - Clone or download the template
 - Open the "config.json" file in the config folder and modify accordingly
 - Press F5 to deploy
 - Publish when ready!

## Documentation
http://wat-docs.azurewebsites.net/ (outdated)

## Feedback / Bug report / feature request
https://github.com/sozercan/wat-uwp/issues

## Contributions
Feel free to submit pull requests

## Credits
Based on http://wat.codeplex.com/