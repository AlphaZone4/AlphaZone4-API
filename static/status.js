window.onload = function(){
	jQuery(document).ready(function($){
		$.ajax({
			url: "//api.alphazone4.com/status",
			dataType: "jsonp",
			success: function(data){
				$("#home_status").html("<a href='http://alphazone4.com' target='_blank'><img src='//api.alphazone4.com/"+data.status+".png' /></a>");
			}
		});
	});
};
